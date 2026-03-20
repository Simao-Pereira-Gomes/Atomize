import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const consoleFormat = printf(({ level, message, timestamp }) => {
	return `${timestamp} [${level}]: ${message}`;
});

export const logger = winston.createLogger({
	level: process.env.ATOMIZE_DEBUG === "1" ? "debug" : process.env.LOG_LEVEL || "warn",
	format: combine(timestamp({ format: "HH:mm:ss" }), consoleFormat),
	transports: [
		new winston.transports.Console({
			format: combine(
				colorize(),
				timestamp({ format: "HH:mm:ss" }),
				consoleFormat,
			),
		}),
	],
});

export default logger;
