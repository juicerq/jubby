import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { safeStorage } from "electron";
import { resolveDataDir } from "@main/store/paths";
import { Logger } from "@main/logger";

function keyPath(): string {
	return join(resolveDataDir(), "entity-key.json");
}

export const EntityKey = {
	has(): boolean {
		return existsSync(keyPath());
	},

	get(): string | null {
		if (!this.has()) {
			return null;
		}

		try {
			const raw = JSON.parse(readFileSync(keyPath(), "utf8")) as {
				ciphertext: string;
			};
			const buffer = Buffer.from(raw.ciphertext, "base64");
			return safeStorage.decryptString(buffer);
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

		const encrypted = safeStorage.encryptString(key);
		const data = { ciphertext: encrypted.toString("base64") };
		const path = keyPath();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify(data));
	},
};
