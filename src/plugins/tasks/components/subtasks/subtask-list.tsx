import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Subtask, SubtaskCategory, SubtaskStatus } from "../../types";
import { usePendingDelete } from "../../useTasksStorage";
import { SubtaskGhost } from "./subtask-ghost";
import { SubtaskItem } from "./subtask-item";

interface SubtaskListProps {
	subtasks: Subtask[];
	workingDirectory: string;
	onUpdateSubtaskStatus: (subtaskId: string, status: SubtaskStatus) => void;
	onDeleteSubtask: (subtaskId: string) => void;
	onReorderSubtasks: (subtaskIds: string[]) => void;
	onUpdateSubtaskText: (subtaskId: string, text: string) => void;
	onUpdateSubtaskCategory: (
		subtaskId: string,
		category: SubtaskCategory,
	) => void;
	onUpdateSubtaskShouldCommit: (
		subtaskId: string,
		shouldCommit: boolean,
	) => void;
	onCreateStep: (subtaskId: string, text: string) => void;
	onToggleStep: (subtaskId: string, stepId: string) => void;
	onDeleteStep: (subtaskId: string, stepId: string) => void;
	onUpdateStepText: (subtaskId: string, stepId: string, text: string) => void;
	onExecuteSubtask: (subtaskId: string) => void;
	onAbortExecution: () => void;
	onViewSubtaskHistory: (subtaskId: string, subtaskText: string) => void;
	isExecuting: boolean;
	executingSubtaskId: string | null;
	hasWorkingDirectory: boolean;
}

function SubtaskList({
	subtasks,
	workingDirectory,
	onUpdateSubtaskStatus,
	onDeleteSubtask,
	onReorderSubtasks,
	onUpdateSubtaskText,
	onUpdateSubtaskCategory,
	onUpdateSubtaskShouldCommit,
	onCreateStep,
	onToggleStep,
	onDeleteStep,
	onUpdateStepText,
	onExecuteSubtask,
	onAbortExecution,
	onViewSubtaskHistory,
	isExecuting,
	executingSubtaskId,
	hasWorkingDirectory,
}: SubtaskListProps) {
	const { pendingId, handleDeleteClick, cancelDelete } =
		usePendingDelete(onDeleteSubtask);

	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(
		null,
	);
	const [isActiveDrag, setIsActiveDrag] = useState(false);
	const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const dragStartPos = useRef<{ x: number; y: number } | null>(null);
	const isDraggingRef = useRef(false);
	const originalPositions = useRef<
		Map<string, { top: number; bottom: number; midY: number }>
	>(new Map());
	const lastDropTarget = useRef<{
		id: string;
		position: "above" | "below";
	} | null>(null);

	const draggedSubtask = useMemo(() => {
		if (!draggedId) return null;
		return subtasks.find((subtask) => subtask.id === draggedId) ?? null;
	}, [subtasks, draggedId]);

	const ghostInsertIndex = useMemo(() => {
		if (!isActiveDrag || !draggedId || !dragOverId || !dropPosition) return -1;

		const draggedIndex = subtasks.findIndex((s) => s.id === draggedId);
		const targetIndex = subtasks.findIndex((s) => s.id === dragOverId);
		if (draggedIndex === -1 || targetIndex === -1) return -1;

		const insertIndex =
			dropPosition === "above" ? targetIndex : targetIndex + 1;

		if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
			return -1;
		}

		return insertIndex;
	}, [subtasks, isActiveDrag, draggedId, dragOverId, dropPosition]);

	const handleMouseDown = (e: React.MouseEvent, subtaskId: string) => {
		if (e.button !== 0) return;
		cancelDelete();
		dragStartPos.current = { x: e.clientX, y: e.clientY };
		setDraggedId(subtaskId);
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
				document.body.classList.add("dragging-subtask");

				originalPositions.current.clear();
				for (const [subtaskId, itemEl] of itemRefs.current.entries()) {
					const rect = itemEl.getBoundingClientRect();
					originalPositions.current.set(subtaskId, {
						top: rect.top,
						bottom: rect.bottom,
						midY: rect.top + rect.height / 2,
					});
				}
			}

			let foundTarget = false;
			const cursorY = e.clientY;

			const sortedItems = Array.from(originalPositions.current.entries())
				.filter(([id]) => id !== draggedId)
				.sort((a, b) => a[1].top - b[1].top);

			const hysteresis = lastDropTarget.current ? 8 : 0;

			for (let i = 0; i < sortedItems.length; i++) {
				const [subtaskId, pos] = sortedItems[i];
				const isCurrentTarget = lastDropTarget.current?.id === subtaskId;

				const prevItem = i > 0 ? sortedItems[i - 1][1] : null;
				const nextItem =
					i < sortedItems.length - 1 ? sortedItems[i + 1][1] : null;

				const aboveZoneTop = prevItem ? prevItem.midY : pos.top - 50;
				const aboveZoneBottom = pos.midY;
				const belowZoneTop = pos.midY;
				const belowZoneBottom = nextItem ? nextItem.midY : pos.bottom + 50;

				const aboveTopThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "above"
						? aboveZoneTop - hysteresis
						: aboveZoneTop;
				const belowBottomThreshold =
					isCurrentTarget && lastDropTarget.current?.position === "below"
						? belowZoneBottom + hysteresis
						: belowZoneBottom;

				if (cursorY >= aboveTopThreshold && cursorY < aboveZoneBottom) {
					if (dragOverId !== subtaskId || dropPosition !== "above") {
						setDragOverId(subtaskId);
						setDropPosition("above");
						lastDropTarget.current = { id: subtaskId, position: "above" };
					}
					foundTarget = true;
					break;
				}

				if (cursorY >= belowZoneTop && cursorY <= belowBottomThreshold) {
					if (dragOverId !== subtaskId || dropPosition !== "below") {
						setDragOverId(subtaskId);
						setDropPosition("below");
						lastDropTarget.current = { id: subtaskId, position: "below" };
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
			const newOrder = [...subtasks];
			const draggedIndex = newOrder.findIndex((s) => s.id === draggedId);
			const targetIndex = newOrder.findIndex((s) => s.id === dragOverId);

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
				onReorderSubtasks(newOrder.map((s) => s.id));
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
		document.body.classList.remove("dragging-subtask");
		window.getSelection()?.removeAllRanges();
	}, [draggedId, dragOverId, dropPosition, subtasks, onReorderSubtasks]);

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

	const setItemRef = useCallback(
		(subtaskId: string, el: HTMLDivElement | null) => {
			if (el) {
				itemRefs.current.set(subtaskId, el);
			} else {
				itemRefs.current.delete(subtaskId);
			}
		},
		[],
	);

	const renderItems = useMemo(() => {
		const items: Array<{
			type: "subtask" | "ghost";
			subtask: Subtask;
			key: string;
		}> = [];

		subtasks.forEach((subtask, index) => {
			if (ghostInsertIndex === index && draggedSubtask) {
				items.push({ type: "ghost", subtask: draggedSubtask, key: "ghost" });
			}

			items.push({ type: "subtask", subtask, key: subtask.id });
		});

		if (ghostInsertIndex === subtasks.length && draggedSubtask) {
			items.push({ type: "ghost", subtask: draggedSubtask, key: "ghost" });
		}

		return items;
	}, [subtasks, ghostInsertIndex, draggedSubtask]);

	return (
		<div className="flex flex-col space-y-0.5">
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
								<SubtaskGhost subtask={item.subtask} />
							</motion.div>
						);
					}

					return (
						<motion.div
							key={item.key}
							layout
							layoutId={item.subtask.id}
							transition={{
								layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
							}}
						>
							<SubtaskItem
								subtask={item.subtask}
								workingDirectory={workingDirectory}
								onUpdateStatus={(status) =>
									onUpdateSubtaskStatus(item.subtask.id, status)
								}
								onDeleteClick={() => handleDeleteClick(item.subtask.id)}
								isPendingDelete={pendingId === item.subtask.id}
								onUpdateText={(text) =>
									onUpdateSubtaskText(item.subtask.id, text)
								}
								onUpdateCategory={(category) =>
									onUpdateSubtaskCategory(item.subtask.id, category)
								}
								onUpdateShouldCommit={(shouldCommit) =>
									onUpdateSubtaskShouldCommit(item.subtask.id, shouldCommit)
								}
								onCreateStep={(text) => onCreateStep(item.subtask.id, text)}
								onToggleStep={(stepId) => onToggleStep(item.subtask.id, stepId)}
								onDeleteStep={(stepId) => onDeleteStep(item.subtask.id, stepId)}
								onUpdateStepText={(stepId, text) =>
									onUpdateStepText(item.subtask.id, stepId, text)
								}
								onExecute={() => onExecuteSubtask(item.subtask.id)}
								onAbort={onAbortExecution}
								onViewHistory={() =>
									onViewSubtaskHistory(item.subtask.id, item.subtask.text)
								}
								isExecuting={isExecuting}
								isThisExecuting={executingSubtaskId === item.subtask.id}
								hasWorkingDirectory={hasWorkingDirectory}
								isDragging={
									draggedId === item.subtask.id && isDraggingRef.current
								}
								isAnyDragging={isActiveDrag}
								onMouseDown={(e) => handleMouseDown(e, item.subtask.id)}
								itemRef={(el) => setItemRef(item.subtask.id, el)}
							/>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
}

export { SubtaskList };
export type { SubtaskListProps };
