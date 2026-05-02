import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Cpu, Folder, Plus } from "lucide-react";
import { useState } from "react";
import { DropdownMenu } from "@renderer/components/DropdownMenu";
import { IconButton } from "@renderer/components/IconButton";
import { CreateFolderModal } from "@renderer/components/modals/CreateFolderModal";
import { CreateTaskModal } from "@renderer/components/modals/CreateTaskModal";
import { PurgeFolderModal } from "@renderer/components/modals/PurgeFolderModal";
import { RenameFolderModal } from "@renderer/components/modals/RenameFolderModal";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";

type ModalState =
	| { kind: "none" }
	| { kind: "create-folder" }
	| { kind: "rename-folder"; id: string; current: string }
	| { kind: "create-task"; folderId: string }
	| { kind: "purge-folder"; id: string; name: string };

export function Sidebar() {
	const folders = useQuery(orpc.folders.list.queryOptions());
	const params = useParams({ strict: false });
	const activeId = params.folderId;
	const [modal, setModal] = useState<ModalState>({ kind: "none" });
	const close = () => setModal({ kind: "none" });

	return (
		<>
			<aside className="flex h-full w-[200px] flex-col border-r border-border bg-surface-1">
				<header className="flex flex-col gap-1 border-b border-border px-3 py-3">
					<div className="flex items-center gap-2">
						<Cpu size={14} className="text-accent" />
						<span className="type-h2 text-accent">JUBBY_OS</span>
					</div>
					<span className="type-ui-label text-fg-muted">SYSTEM ACTIVE</span>
				</header>

				<div className="group flex items-center justify-between border-b border-border px-3 py-2">
					<span className="type-ui-label text-fg-muted">DIRECTORIES</span>
					<IconButton
						aria-label="Init directory"
						onClick={() => setModal({ kind: "create-folder" })}
						className="opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<Plus size={13} />
					</IconButton>
				</div>

				<nav className="flex-1 overflow-y-auto">
					{folders.data?.map((folder) => (
						<FolderRow
							key={folder.id}
							id={folder.id}
							name={folder.name}
							active={activeId === folder.id}
							onCreateTask={() =>
								setModal({ kind: "create-task", folderId: folder.id })
							}
							onRename={() =>
								setModal({
									kind: "rename-folder",
									id: folder.id,
									current: folder.name,
								})
							}
							onPurge={() =>
								setModal({
									kind: "purge-folder",
									id: folder.id,
									name: folder.name,
								})
							}
						/>
					))}
				</nav>
			</aside>

			{modal.kind === "create-folder" && <CreateFolderModal onClose={close} />}
			{modal.kind === "rename-folder" && (
				<RenameFolderModal
					id={modal.id}
					current={modal.current}
					onClose={close}
				/>
			)}
			{modal.kind === "purge-folder" && (
				<PurgeFolderModal
					id={modal.id}
					name={modal.name}
					onClose={close}
				/>
			)}
			{modal.kind === "create-task" && (
				<CreateTaskModal folderId={modal.folderId} onClose={close} />
			)}
		</>
	);
}

type FolderRowProps = {
	id: string;
	name: string;
	active: boolean;
	onCreateTask: () => void;
	onRename: () => void;
	onPurge: () => void;
};

function FolderRow({
	id,
	name,
	active,
	onCreateTask,
	onRename,
	onPurge,
}: FolderRowProps) {
	return (
		<div
			className={cn(
				"group relative flex items-center border-l-2 px-3 py-2 transition-colors",
				active
					? "border-accent bg-accent-dim/30"
					: "border-transparent hover:bg-surface-2",
			)}
		>
			<Link
				to="/folders/$folderId"
				params={{ folderId: id }}
				aria-label={name}
				className="absolute inset-0"
			/>
			<div className="flex flex-1 items-center gap-2 truncate">
				<Folder
					size={14}
					className={active ? "text-accent" : "text-fg-muted"}
				/>
				<span
					className={cn(
						"type-ui-label truncate",
						active ? "text-accent" : "text-fg",
					)}
				>
					{name}
				</span>
			</div>

			<div
				className={cn(
					"relative z-10 flex items-center transition-opacity",
					active
						? "opacity-100"
						: "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
				)}
			>
				<IconButton aria-label="Append task" onClick={onCreateTask}>
					<Plus size={11} />
				</IconButton>
				<DropdownMenu
					aria-label="Folder actions"
					items={[
						{ label: "Rename", onSelect: onRename },
						{
							label: "Purge",
							onSelect: onPurge,
							danger: true,
						},
					]}
				/>
			</div>
		</div>
	);
}
