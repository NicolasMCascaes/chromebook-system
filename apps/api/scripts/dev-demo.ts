import { spawn } from "node:child_process";
import { createRequire } from "node:module";

process.loadEnvFile(".env.demo");
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "--port", "3001"], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
