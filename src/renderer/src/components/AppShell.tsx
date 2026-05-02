import { type ReactNode, useState } from "react";
import { CrtPowerOn } from "@renderer/components/CrtPowerOn";
import { Sidebar } from "@renderer/components/Sidebar";
import { StatusBar } from "@renderer/components/StatusBar";
import { Titlebar } from "@renderer/components/Titlebar";

export function AppShell({ children }: { children: ReactNode }) {
	const [booted, setBooted] = useState(false);

	return (
		<div className="flex h-screen flex-col bg-bg text-fg">
			<Titlebar />
			<div className="flex flex-1 overflow-hidden">
				<Sidebar />
				<main className="flex flex-1 flex-col overflow-hidden">
					{children}
				</main>
			</div>
			<StatusBar />
			{!booted && <CrtPowerOn onComplete={() => setBooted(true)} />}
		</div>
	);
}
