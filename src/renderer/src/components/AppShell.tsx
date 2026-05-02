import { type ReactNode, useState } from "react";
import { BootSequence } from "@renderer/components/BootSequence";
import { Sidebar } from "@renderer/components/Sidebar";
import { StatusBar } from "@renderer/components/StatusBar";

export function AppShell({ children }: { children: ReactNode }) {
	const [booted, setBooted] = useState(false);

	return (
		<div className="flex h-screen flex-col bg-bg text-fg">
			<div className="flex flex-1 overflow-hidden">
				<Sidebar />
				<main className="flex flex-1 flex-col overflow-hidden">
					{children}
				</main>
			</div>
			<StatusBar />
			{!booted && <BootSequence onComplete={setBooted} />}
		</div>
	);
}
