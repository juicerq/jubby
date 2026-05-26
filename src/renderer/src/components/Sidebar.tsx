import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { DropdownMenu } from "@renderer/components/DropdownMenu";
import { Entity } from "@renderer/components/Entity";
import { Heatmap } from "@renderer/components/Heatmap";
import { IconButton } from "@renderer/components/IconButton";
import { CreateFolderModal } from "@renderer/components/modals/CreateFolderModal";
import { CreateTaskModal } from "@renderer/components/modals/CreateTaskModal";
import { ManageTagsModal } from "@renderer/components/modals/ManageTagsModal";
import { PurgeFolderModal } from "@renderer/components/modals/PurgeFolderModal";
import { RenameFolderModal } from "@renderer/components/modals/RenameFolderModal";
import { orpc } from "@renderer/lib/api";
import { cn } from "@renderer/lib/cn";

type ModalState =
	| { kind: "none" }
	| { kind: "create-folder" }
	| { kind: "rename-folder"; id: string; current: string }
	| { kind: "create-task"; folderId: string }
	| { kind: "purge-folder"; id: string; name: string }
	| { kind: "manage-tags" };

export function Sidebar() {
	const folders = useQuery(orpc.folders.list.queryOptions());
	const params = useParams({ strict: false });
	const location = useLocation();
	const activeId = params.folderId;
	const queueActive = location.pathname === "/";
	const [modal, setModal] = useState<ModalState>({ kind: "none" });
	const close = () => setModal({ kind: "none" });

	return (
		<>
			<aside className="flex h-full w-[200px] flex-col border-r border-border bg-surface-1">
				<Entity />

				<QueueRow active={queueActive} />

				<div className="group flex items-center justify-between border-b border-border px-3 py-2">
					<span className="type-ui-label text-fg-muted">DIRECTORIES</span>
					<IconButton
						aria-label="Init directory"
						onClick={() => setModal({ kind: "create-folder" })}
						className="type-mono-data opacity-0 group-hover:opacity-100 transition-opacity"
					>
						[+]
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

				<div className="flex items-center justify-between border-t border-border px-3 py-1">
					<span className="type-ui-label text-fg-muted">TAGS</span>
					<IconButton
						aria-label="Manage tags"
						onClick={() => setModal({ kind: "manage-tags" })}
						className="type-mono-data"
					>
						[manage]
					</IconButton>
				</div>

				<Heatmap />
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
			{modal.kind === "manage-tags" && <ManageTagsModal onClose={close} />}
		</>
	);
}

type SidebarRowProps = {
	active: boolean;
	link: ReactNode;
	icon?: ReactNode;
	label: string;
	actions?: ReactNode;
};

function SidebarRow({ active, link, icon, label, actions }: SidebarRowProps) {
	return (
		<div
			className={cn(
				"group relative flex items-center px-3 py-2 transition-colors",
				active ? "bg-accent-dim/30" : "hover:bg-surface-2",
			)}
		>
			{link}
			<div className="flex flex-1 items-center gap-2 truncate">
				<span
					aria-hidden
					className={cn(
						"type-ui-label text-accent",
						active ? "visible" : "invisible",
					)}
				>
					{">"}
				</span>
				{icon}
				<span
					className={cn(
						"type-ui-label truncate",
						active ? "text-accent" : "text-fg",
					)}
				>
					{label}
				</span>
			</div>
			{actions}
		</div>
	);
}

function QueueRow({ active }: { active: boolean }) {
	return (
		<SidebarRow
			active={active}
			link={<Link to="/" aria-label="QUEUE" className="absolute inset-0" />}
			icon={
				<span
					aria-hidden
					className={cn(
						"type-ui-label",
						active ? "text-accent" : "text-fg-muted",
					)}
				>
					≡
				</span>
			}
			label="QUEUE"
		/>
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
		<SidebarRow
			active={active}
			link={
				<Link
					to="/folders/$folderId"
					params={{ folderId: id }}
					aria-label={name}
					className="absolute inset-0"
				/>
			}
			label={`/${name}`}
			actions={
				<div className="relative z-10 flex items-center transition-opacity pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100">

					<IconButton
						aria-label="Append task"
						onClick={onCreateTask}
						className="type-mono-data"
					>
						[+]
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
			}
		/>
	);
}
