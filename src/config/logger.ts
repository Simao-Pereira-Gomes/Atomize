import winston from "winston";
import Transport from "winston-transport";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";

const { combine, timestamp, printf, colorize } = winston.format;

const consoleFormat = printf(({ level, message, timestamp }) => {
	return `${timestamp} [${level}]: ${message}`;
});

class ManagedConsoleTransport extends Transport {
	log(info: winston.Logform.TransformableInfo, callback: () => void): void {
		queueMicrotask(() => this.emit("logged", info));
		const renderedMessage = info[Symbol.for("message")];
		const message =
			typeof renderedMessage === "string"
				? renderedMessage
				: `${String(info.message)}`;
		const stream = info.level === "error" || info.level === "warn" ? "stderr" : "stdout";
		writeManagedOutput(stream, message);
		callback();
	}
}

export const logger = winston.createLogger({
	level: process.env.ATOMIZE_DEBUG === "1" ? "debug" : process.env.LOG_LEVEL || "warn",
	format: combine(timestamp({ format: "HH:mm:ss" }), consoleFormat),
	transports: [
		new ManagedConsoleTransport({
			format: combine(
				colorize(),
				timestamp({ format: "HH:mm:ss" }),
				consoleFormat,
			),
		}),
	],
});

export default logger;
