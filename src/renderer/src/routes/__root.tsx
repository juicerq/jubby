import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@renderer/components/AppShell";
import { ToastProvider } from "@renderer/components/Toast";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<ToastProvider>
			<AppShell>
				<Outlet />
			</AppShell>
		</ToastProvider>
	);
}
