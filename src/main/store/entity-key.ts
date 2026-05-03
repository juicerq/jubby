import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { safeStorage } from "electron";
import { resolveDataDir } from "@main/store/paths";
import { Logger } from "@main/logger";

function keyPath(): string {
	return join(resolveDataDir(), "entity-key.json");
}

function readEncrypted(): string | null {
	try {
		return readFileSync(keyPath(), "utf8");
	} catch (err: any) {
		if (err?.code === "ENOENT") {
			return null;
		}
		throw err;
	}
}

export const EntityKey = {
	has(): boolean {
		return readEncrypted() !== null;
	},

	get(): string | null {
		const raw = readEncrypted();
		if (raw === null) {
			return null;
		}

		try {
			const { ciphertext } = JSON.parse(raw) as { ciphertext: string };
			return safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
		} catch (err: any) {
			Logger.error("entity-key:decrypt", { err: String(err) });
			return null;
		}
	},

	set(key: string): void {
		if (!safeStorage.isEncryptionAvailable()) {
			throw new Error(
				"Criptografia do sistema indisponível. Instale um keyring (ex: gnome-keyring) para armazenar a API key.",
			);
		}

		const ciphertext = safeStorage.encryptString(key).toString("base64");
		const path = keyPath();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify({ ciphertext }));
	},
};
