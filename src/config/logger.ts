import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const consoleFormat = printf(({ level, message, timestamp }) => {
	return `${timestamp} [${level}]: ${message}`;
});

export const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || "info",
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
