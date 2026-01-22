import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Step } from "../../types";

interface SubtaskStepsProps {
	steps: Step[];
	newStepValue: string;
	onNewStepValueChange: (value: string) => void;
	onStepKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	onToggleStep: (stepId: string) => void;
	onDeleteStep: (stepId: string) => void;
	onStartEditStep: (step: Step) => void;
	editingStepId: string | null;
	editingStepValue: string;
	onEditingStepValueChange: (value: string) => void;
	onSaveStepEdit: () => void;
	onStepEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	stepInputRef: React.RefObject<HTMLInputElement | null>;
	editStepInputRef: React.RefObject<HTMLInputElement | null>;
}

function SubtaskSteps({
	steps,
	newStepValue,
	onNewStepValueChange,
	onStepKeyDown,
	onToggleStep,
	onDeleteStep,
	onStartEditStep,
	editingStepId,
	editingStepValue,
	onEditingStepValueChange,
	onSaveStepEdit,
	onStepEditKeyDown,
	stepInputRef,
	editStepInputRef,
}: SubtaskStepsProps) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[10px] font-medium tracking-wider text-white/35">
				Steps
			</span>
			<div className="flex flex-col gap-1">
				{steps.map((step) => (
					<div
						key={step.id}
						className="group/step flex items-center gap-2 rounded py-0.5"
					>
						<button
							type="button"
							onClick={() => onToggleStep(step.id)}
							className={cn(
								"flex h-3 w-3 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-all duration-150 ease-out active:scale-[0.9]",
								step.completed
									? "border-white/40 bg-white/40"
									: "border-white/20 bg-transparent hover:border-white/35",
							)}
							aria-label={step.completed ? "Uncheck step" : "Check step"}
						>
							{step.completed && <Check className="h-2 w-2 text-[#0a0a0a]" />}
						</button>

						{editingStepId === step.id ? (
							<input
								ref={editStepInputRef}
								type="text"
								value={editingStepValue}
								onChange={(e) => onEditingStepValueChange(e.target.value)}
								onKeyDown={onStepEditKeyDown}
								onBlur={onSaveStepEdit}
								className="flex-1 bg-transparent text-[11px] leading-tight text-white/60 outline-none"
								autoComplete="off"
							/>
						) : (
							<span
								onDoubleClick={() => onStartEditStep(step)}
								className={cn(
									"flex-1 cursor-text text-[11px] leading-tight transition-all duration-150",
									step.completed
										? "text-white/25 line-through decoration-white/15"
										: "text-white/60",
								)}
							>
								{step.text}
							</span>
						)}

						<button
							type="button"
							onClick={() => onDeleteStep(step.id)}
							className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-150 ease-out hover:bg-red-500/15 group-hover/step:opacity-100 active:scale-90"
							aria-label="Delete step"
						>
							<X className="h-2.5 w-2.5 text-white/30 transition-colors duration-150 hover:text-red-400" />
						</button>
					</div>
				))}

				<div className="flex items-center gap-2 pt-1">
					<Plus className="h-3 w-3 shrink-0 text-white/20" />
					<input
						ref={stepInputRef}
						type="text"
						placeholder="Add step..."
						value={newStepValue}
						onChange={(e) => onNewStepValueChange(e.target.value)}
						onKeyDown={onStepKeyDown}
						className="flex-1 bg-transparent text-[11px] leading-tight text-white/60 outline-none placeholder:text-white/25"
						autoComplete="off"
					/>
				</div>
			</div>
		</div>
	);
}

export { SubtaskSteps };
export type { SubtaskStepsProps };
