export const preetyLogger ={
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          levelFirst: true,
          // translateTime: "SYS:standard",
          // 'HH:mm:ss.SSS' extracts hours, mins, seconds, and milliseconds
       translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l", 
          singleLine: true,
          ignore: "pid,hostname",
        },
      },
    },
  }