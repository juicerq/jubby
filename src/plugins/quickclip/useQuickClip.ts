import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";
import type { AudioMode, Framerate, Recording, ResolutionScale } from "./types";
import { useQuickClipStorage } from "./useQuickClipStorage";

const log = createLogger("quickclip");

interface MonitorInfo {
	id: string;
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	isPrimary: boolean;
}

interface CaptureSourcesResponse {
	monitors: MonitorInfo[];
	windows: Array<{
		id: number;
		title: string;
		appName: string;
		x: number;
		y: number;
		width: number;
		height: number;
		isMinimized: boolean;
	}>;
}

interface RecordingStatus {
	isRecording: boolean;
	isStarting: boolean;
	isStopping: boolean;
	frameCount: number;
	elapsedSeconds: number;
	resolution: [number, number] | null;
	error: string | null;
}

interface UseQuickClipReturn {
	isRecording: boolean;
	isPreparing: boolean;
	isEncoding: boolean;
	recordingStatus: RecordingStatus | null;
	monitors: MonitorInfo[];
	ffmpegAvailable: boolean | null;

	recordings: Recording[];
	isLoadingRecordings: boolean;

	startRecording: (
		audioMode?: AudioMode,
		resolution?: ResolutionScale,
		framerate?: Framerate,
	) => Promise<void>;
	stopRecording: () => Promise<Recording | null>;
	deleteRecording: (id: string) => Promise<void>;
	refreshSources: () => Promise<void>;
	checkFfmpeg: () => Promise<boolean>;
}

export function useQuickClip(): UseQuickClipReturn {
	const [isRecording, setIsRecording] = useState(false);
	const [isPreparing, setIsPreparing] = useState(false);
	const [isEncoding, setIsEncoding] = useState(false);
	const [recordingStatus, setRecordingStatus] =
		useState<RecordingStatus | null>(null);
	const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
	const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);

	const {
		recordings,
		isLoading: isLoadingRecordings,
		deleteRecording,
		refreshRecordings,
	} = useQuickClipStorage();

	const checkFfmpeg = useCallback(async () => {
		try {
			const available = await invoke<boolean>("recorder_check_ffmpeg");
			setFfmpegAvailable(available);
			log.info("FFmpeg availability checked", { available });
			return available;
		} catch (error) {
			log.error("Failed to check FFmpeg", { error: String(error) });
			setFfmpegAvailable(false);
			return false;
		}
	}, []);

	const refreshSources = useCallback(async () => {
		try {
			const sources = await invoke<CaptureSourcesResponse>(
				"capture_get_sources",
			);
			setMonitors(sources.monitors);
			log.debug("Capture sources refreshed", {
				monitorCount: sources.monitors.length,
			});
		} catch (error) {
			log.error("Failed to get capture sources", { error: String(error) });
			toast.error("Failed to get capture sources");
		}
	}, []);

	const startRecording = useCallback(
		async (
			audioMode: AudioMode = "none",
			resolution: ResolutionScale = "720p",
			framerate: Framerate = "30",
		) => {
			log.info("Starting recording", { audioMode, resolution, framerate });
			setIsPreparing(true);

			try {
				await invoke("recorder_start", {
					resolutionScale: resolution,
					framerate,
					audioMode,
				});

				setIsRecording(true);
				log.info("Recording started successfully");
			} catch (error) {
				const errorStr = String(error);
				log.error("Failed to start recording", { error: errorStr });
				// Don't show error toast if user cancelled the portal dialog
				if (
					!errorStr.includes("UserCancelled") &&
					!errorStr.includes("user cancelled")
				) {
					toast.error(`Failed to start recording: ${error}`);
				}
			} finally {
				setIsPreparing(false);
			}
		},
		[],
	);

	const stopRecording = useCallback(async () => {
		if (!isRecording) return null;

		log.info("Stopping recording...");

		try {
			const recording = await invoke<Recording>("recorder_stop");
			log.info("Recording stopped and saved", { id: recording.id });
			toast.success("Recording saved!");
			return recording;
		} catch (error) {
			log.error("Failed to stop recording", { error: String(error) });
			toast.error(`Failed to stop recording: ${error}`);
			return null;
		}
	}, [isRecording]);

	// Event-based state sync (replaces polling)
	useEffect(() => {
		const unlistenStateChange = listen<RecordingStatus>(
			"quickclip:state-change",
			(event) => {
				const status = event.payload;
				log.debug("State change event received", { status });

				setRecordingStatus(status);
				setIsRecording(status.isRecording);
				setIsPreparing(status.isStarting);
				setIsEncoding(status.isStopping);
			},
		);

		const unlistenError = listen<string>("quickclip:error", (event) => {
			const error = event.payload;
			log.error("Recording error event", { error });
			if (
				!error.includes("UserCancelled") &&
				!error.includes("user cancelled")
			) {
				toast.error(`Recording error: ${error}`);
			}
		});

		return () => {
			unlistenStateChange.then((fn) => fn()).catch(() => {});
			unlistenError.then((fn) => fn()).catch(() => {});
		};
	}, []);

	// Check FFmpeg on mount
	useEffect(() => {
		checkFfmpeg();
		refreshSources();
	}, [checkFfmpeg, refreshSources]);

	// Refresh recordings list when recording stops (triggered by legacy event)
	useEffect(() => {
		const unlistenStopped = listen("quickclip:recording-stopped", async () => {
			log.info("Recording stopped, refreshing list");
			try {
				await refreshRecordings();
			} catch (e) {
				log.error("Failed to refresh recordings", { error: String(e) });
			}
		});

		return () => {
			unlistenStopped.then((fn) => fn()).catch(() => {});
		};
	}, [refreshRecordings]);

	return {
		isRecording,
		isPreparing,
		isEncoding,
		recordingStatus,
		monitors,
		ffmpegAvailable,

		recordings,
		isLoadingRecordings,

		startRecording,
		stopRecording,
		deleteRecording,
		refreshSources,
		checkFfmpeg,
	};
}
