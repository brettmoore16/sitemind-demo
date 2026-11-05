import http from 'node:http';
import { createApp } from './backend/app.mjs';
const port=Number(process.env.PORT || 3000);
const server=http.createServer({requestTimeout:30000,headersTimeout:10000,keepAliveTimeout:5000},createApp());
server.maxRequestsPerSocket=100;
server.listen(port,'0.0.0.0',()=>console.log(`SiteMind server listening on port ${port}`));
