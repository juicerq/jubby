import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Folder } from "../../types";
import { FolderCard } from "./folder-card";
import { FolderGhost } from "./folder-ghost";

interface FolderListProps {
	folders: Folder[];
	onFolderClick: (folderId: string) => void;
	onReorder: (folderIds: string[]) => void;
}

function FolderList({ folders, onFolderClick, onReorder }: FolderListProps) {
	const sortedFolders = [...folders].sort((a, b) => a.position - b.position);

	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(
		null,
	);
	const [isActiveDrag, setIsActiveDrag] = useState(false);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const dragStartPos = useRef<{ x: number; y: number } | null>(null);
	const isDraggingRef = useRef(false);
	const originalPositions = useRef<
		Map<string, { top: number; bottom: number; midY: number }>
	>(new Map());
	const lastDropTarget = useRef<{
		id: string;
		position: "above" | "below";
	} | null>(null);

	const draggedFolder = useMemo(() => {
		if (!draggedId) return null;
		return sortedFolders.find((folder) => folder.id === draggedId) ?? null;
	}, [sortedFolders, draggedId]);

	const ghostInsertIndex = useMemo(() => {
		if (!isActiveDrag || !draggedId || !dragOverId || !dropPosition) return -1;

		const draggedIndex = sortedFolders.findIndex((f) => f.id === draggedId);
		const targetIndex = sortedFolders.findIndex((f) => f.id === dragOverId);
		if (draggedIndex === -1 || targetIndex === -1) return -1;

		const insertIndex =
			dropPosition === "above" ? targetIndex : targetIndex + 1;

		if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
			return -1;
		}

		return insertIndex;
	}, [sortedFolders, isActiveDrag, draggedId, dragOverId, dropPosition]);

	const handleMouseDown = (e: React.MouseEvent, folderId: string) => {
		if (e.button !== 0) return;
		dragStartPos.current = { x: e.clientX, y: e.clientY };
		setDraggedId(folderId);
	};

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!draggedId || !dragStartPos.current) return;

			const dx = e.clientX - dragStartPos.current.x;
			const dy = e.clientY - dragStartPos.current.y;
			if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) < 5) return;

			if (!isDraggingRef.current) {
				isDraggingRef.current = true;
				setIsActiveDrag(true);
				document.body.classList.add("dragging-folder");

				originalPositions.current.clear();
				for (const [folderId, cardEl] of cardRefs.current.entries()) {
					const rect = cardEl.getBoundingClientRect();
					originalPositions.current.set(folderId, {
						top: rect.top,
						bottom: rect.bottom,
						midY: rect.top + rect.height / 2,
					});
				}
			}

			let foundTarget = false;
			const cursorY = e.clientY;

			const sortedCards = Array.from(originalPositions.current.entries())
				.filter(([id]) => id !== draggedId)
				.sort((a, b) => a[1].top - b[1].top);

			const hysteresis = lastDropTarget.current ? 8 : 0;

			for (let i = 0; i < sortedCards.length; i++) {
				const [folderId, pos] = sortedCards[i];
				const isCurrentTarget = lastDropTarget.current?.id === folderId;

				const prevCard = i > 0 ? sortedCards[i - 1][1] : null;
				const nextCard =
					i < sortedCards.length - 1 ? sortedCards[i + 1][1] : null;

				const aboveZoneTop = prevCard ? prevCard.midY : pos.top - 100;
				const aboveZoneBottom = pos.midY;
				const belowZoneTop = pos.midY;
				const belowZoneBottom = nextCard ? nextCard.midY : pos.bottom + 100;

				const aboveTopThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "above"
						? aboveZoneTop - hysteresis
						: aboveZoneTop;
				const belowBottomThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "below"
						? belowZoneBottom + hysteresis
						: belowZoneBottom;

				if (cursorY >= aboveTopThreshold && cursorY < aboveZoneBottom) {
					if (dragOverId !== folderId || dropPosition !== "above") {
						setDragOverId(folderId);
						setDropPosition("above");
						lastDropTarget.current = { id: folderId, position: "above" };
					}
					foundTarget = true;
					break;
				}

				if (cursorY >= belowZoneTop && cursorY <= belowBottomThreshold) {
					if (dragOverId !== folderId || dropPosition !== "below") {
						setDragOverId(folderId);
						setDropPosition("below");
						lastDropTarget.current = { id: folderId, position: "below" };
					}
					foundTarget = true;
					break;
				}
			}

			if (!foundTarget) {
				setDragOverId(null);
				setDropPosition(null);
				lastDropTarget.current = null;
			}
		},
		[draggedId, dragOverId, dropPosition],
	);

	const handleMouseUp = useCallback(() => {
		if (draggedId && isDraggingRef.current && dragOverId && dropPosition) {
			const newOrder = [...sortedFolders];
			const draggedIndex = newOrder.findIndex((f) => f.id === draggedId);
			const targetIndex = newOrder.findIndex((f) => f.id === dragOverId);

			if (draggedIndex !== -1 && targetIndex !== -1) {
				const [draggedItem] = newOrder.splice(draggedIndex, 1);

				let insertIndex = targetIndex;
				if (dropPosition === "below") {
					insertIndex =
						draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
				} else {
					insertIndex =
						draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
				}

				newOrder.splice(insertIndex, 0, draggedItem);
				onReorder(newOrder.map((f) => f.id));
			}
		}

		setDraggedId(null);
		setDragOverId(null);
		setDropPosition(null);
		setIsActiveDrag(false);
		dragStartPos.current = null;
		isDraggingRef.current = false;
		originalPositions.current.clear();
		lastDropTarget.current = null;
		document.body.classList.remove("dragging-folder");
	}, [draggedId, dragOverId, dropPosition, sortedFolders, onReorder]);

	useEffect(() => {
		if (draggedId) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			return () => {
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};
		}
	}, [draggedId, handleMouseMove, handleMouseUp]);

	const setCardRef = useCallback(
		(folderId: string, el: HTMLDivElement | null) => {
			if (el) {
				cardRefs.current.set(folderId, el);
			} else {
				cardRefs.current.delete(folderId);
			}
		},
		[],
	);

	const renderItems = useMemo(() => {
		const items: Array<{
			type: "folder" | "ghost";
			folder: Folder;
			key: string;
		}> = [];

		sortedFolders.forEach((folder, index) => {
			if (ghostInsertIndex === index && draggedFolder) {
				items.push({ type: "ghost", folder: draggedFolder, key: "ghost" });
			}

			items.push({ type: "folder", folder, key: folder.id });
		});

		if (ghostInsertIndex === sortedFolders.length && draggedFolder) {
			items.push({ type: "ghost", folder: draggedFolder, key: "ghost" });
		}

		return items;
	}, [sortedFolders, ghostInsertIndex, draggedFolder]);

	return (
		<div className="-mx-2 flex flex-1 flex-col gap-1.5 overflow-y-auto px-2">
			<AnimatePresence mode="popLayout">
				{renderItems.map((item) => {
					if (item.type === "ghost") {
						return (
							<motion.div
								key="ghost"
								initial={{ opacity: 0, scale: 0.95, height: 0 }}
								animate={{ opacity: 1, scale: 1, height: "auto" }}
								exit={{ opacity: 0, scale: 0.95, height: 0 }}
								transition={{ duration: 0.15, ease: "easeOut" }}
							>
								<FolderGhost folder={item.folder} />
							</motion.div>
						);
					}

					return (
						<motion.div
							key={item.key}
							layout
							layoutId={item.folder.id}
							transition={{
								layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
							}}
						>
							<FolderCard
								folder={item.folder}
								onClick={() => {
									if (!isDraggingRef.current) {
										onFolderClick(item.folder.id);
									}
								}}
								isDragging={
									draggedId === item.folder.id && isDraggingRef.current
								}
								onMouseDown={(e) => handleMouseDown(e, item.folder.id)}
								cardRef={(el) => setCardRef(item.folder.id, el)}
							/>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
}

export { FolderList };
export type { FolderListProps };
