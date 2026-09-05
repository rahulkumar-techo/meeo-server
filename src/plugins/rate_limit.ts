import type { FastifyInstance } from "fastify";
import rateLimit from '@fastify/rate-limit';

export async  function appRateLimit(app:FastifyInstance) {
    
    app.register(rateLimit,{
        max:1000,
        timeWindow:'1 minutes'
    })
}