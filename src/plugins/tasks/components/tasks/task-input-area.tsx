import { FolderOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { useWorkingDirectory } from "../../hooks/use-working-directory";
import type { Tag as TagType } from "../../types";
import { TagButton, TagSelector } from "../tags/tag-elements";

interface TaskInputAreaProps {
	value: string;
	onChange: (value: string) => void;
	onCreateTask: (
		text: string,
		tagIds: string[] | undefined,
		description: string,
		workingDirectory: string,
	) => void;
	onTagsClick: () => void;
	tags: TagType[];
	selectedTagIds: string[];
	onToggleTag: (tagId: string) => void;
}

function TaskInputArea({
	value,
	onChange,
	onCreateTask,
	onTagsClick,
	tags,
	selectedTagIds,
	onToggleTag,
}: TaskInputAreaProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [description, setDescription] = useState("");
	const {
		value: workingDirectory,
		setValue: setWorkingDirectory,
		error: workingDirectoryError,
		setError: setWorkingDirectoryError,
		selectFolder,
		validate,
	} = useWorkingDirectory();
	const inputRef = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLDivElement>(null);

	const shouldShowExpandedForm = isExpanded || value.trim().length > 0;

	const handleFocus = () => {
		setIsExpanded(true);
	};

	const handleSubmit = () => {
		if (!value.trim()) return;

		if (!validate()) {
			return;
		}

		onCreateTask(
			value.trim(),
			selectedTagIds.length > 0 ? selectedTagIds : undefined,
			description.trim(),
			workingDirectory.trim(),
		);

		onChange("");
		setDescription("");
		setWorkingDirectoryError("");
		setIsExpanded(false);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && value.trim()) {
			e.preventDefault();
			handleSubmit();
		} else if (e.key === "Escape") {
			handleCancel();
		}
	};

	const handleCancel = useCallback(() => {
		onChange("");
		setDescription("");
		setWorkingDirectoryError("");
		setIsExpanded(false);
		inputRef.current?.blur();
	}, [onChange, setWorkingDirectoryError]);

	useEffect(() => {
		if (!shouldShowExpandedForm) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (formRef.current && !formRef.current.contains(e.target as Node)) {
				if (!value.trim()) {
					handleCancel();
				}
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [shouldShowExpandedForm, value, handleCancel]);

	return (
		<div
			ref={formRef}
			className="flex shrink-0 flex-col"
			onClick={(e) => e.stopPropagation()}
		>
			<motion.div
				className="overflow-hidden rounded-[10px] border border-transparent bg-white/4 transition-colors duration-180ms ease-out"
				animate={{
					borderColor: shouldShowExpandedForm
						? "rgba(255, 255, 255, 0.08)"
						: "transparent",
					backgroundColor: shouldShowExpandedForm
						? "rgba(255, 255, 255, 0.06)"
						: "rgba(255, 255, 255, 0.04)",
				}}
				transition={{ duration: 0.18 }}
			>
				<div className="flex gap-2 p-1.5">
					<div className="relative flex-1">
						<input
							ref={inputRef}
							type="text"
							placeholder="What needs to be done?"
							value={value}
							onChange={(e) => {
								onChange(e.target.value);
								setWorkingDirectoryError("");
							}}
							onFocus={handleFocus}
							onKeyDown={handleKeyDown}
							className="h-8 w-full rounded-md bg-transparent px-2.5 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none placeholder:text-white/35"
							autoComplete="off"
						/>
					</div>
					<TagButton onClick={onTagsClick} small />
				</div>

				<AnimatePresence>
					{shouldShowExpandedForm && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
							className="overflow-hidden"
						>
							<div className="flex flex-col gap-2.5 px-1.5 pb-2.5">
								<div className="h-px bg-white/6" />

								<div className="flex flex-col gap-1.5">
									<span className="px-1 text-[11px] font-medium text-white/40">
										Description
									</span>
									<textarea
										placeholder="Add more details..."
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										rows={2}
										aria-label="Description"
										className="w-full resize-none rounded-md border border-transparent bg-white/4 px-2.5 py-2 text-[12px] font-normal leading-relaxed text-white/90 outline-none transition-all duration-180ms ease-out placeholder:text-white/30 hover:bg-white/6 focus:border-white/10 focus:bg-white/6"
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<span className="px-1 text-[11px] font-medium text-white/40">
										Working Directory
									</span>
									<div className="flex gap-1.5">
										<input
											type="text"
											placeholder="/path/to/project"
											value={workingDirectory}
											onChange={(e) => {
												setWorkingDirectory(e.target.value);
												setWorkingDirectoryError("");
											}}
											aria-label="Working directory"
											className={cn(
												"h-8 flex-1 rounded-md border bg-white/4 px-2.5 text-[12px] font-normal text-white/90 outline-none transition-all duration-180ms ease-out placeholder:text-white/30 hover:bg-white/6 focus:bg-white/6",
												workingDirectoryError
													? "border-red-500/50 focus:border-red-500/70"
													: "border-transparent focus:border-white/10",
											)}
										/>
										<button
											type="button"
											onClick={selectFolder}
											className="group flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-white/4 transition-all duration-180ms ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96]"
											aria-label="Select folder"
											title="Select folder"
										>
											<FolderOpen className="h-3.5 w-3.5 text-white/40 transition-colors duration-180ms ease-out group-hover:text-white/70" />
										</button>
									</div>
									{workingDirectoryError && (
										<span className="px-1 text-[11px] text-red-400">
											{workingDirectoryError}
										</span>
									)}
								</div>

								{tags.length > 0 && (
									<div className="flex flex-col gap-1.5">
										<span className="px-1 text-[11px] font-medium text-white/40">
											Tags
										</span>
										<TagSelector
											tags={tags}
											selectedTagIds={selectedTagIds}
											onToggleTag={onToggleTag}
										/>
									</div>
								)}

								<div className="flex justify-end gap-1.5 pt-1">
									<button
										type="button"
										onClick={handleCancel}
										className="h-7 cursor-pointer rounded-md px-3 text-[11px] font-medium text-white/50 transition-all duration-180ms ease-out hover:bg-white/6 hover:text-white/70"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleSubmit}
										disabled={!value.trim()}
										className="h-7 cursor-pointer rounded-md bg-white/10 px-3 text-[11px] font-medium text-white/90 transition-all duration-180ms ease-out hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
									>
										Create Task
									</button>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</div>
	);
}

export { TaskInputArea };
export type { TaskInputAreaProps };
