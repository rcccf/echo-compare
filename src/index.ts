/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

import dataChannelPage from './datachannel.html';
import websocketPage from './websocket.html';
import combinePage from './combine.html';

/**
 * Associate bindings declared in wrangler.toml with the TypeScript type system
 */
export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
	APP_ID: string;
	APP_TOKEN: string;
}

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject {
	private state: DurableObjectState;
	private storage: DurableObjectStorage;
	private env: Env;
	private sessions: Record<string, WebSocket> = {};
	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier
	 *
	 * @param state - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(state: DurableObjectState, env: Env) {
		this.state = state;

		// `state.storage` provides access to our durable storage. It provides a simple KV
		// get()/put() interface.
		this.storage = state.storage;

		// `env` is our environment bindings (discussed earlier).
		this.env = env;
	}

	/**
	 * The Durable Object fetch handler will be invoked when a Durable Object instance receives a
	 * 	request from a Worker via an associated stub
	 *
	 * @param request - The request submitted to a Durable Object instance from a Worker
	 * @returns The response to be sent back to the Worker
	 */
	async fetch(request: Request): Promise<Response> {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		server.accept();

		const id = crypto.randomUUID();

		this.sessions[id] = server;

		server.addEventListener('message', (event: MessageEvent) => {
			for (const id in this.sessions) {
				this.sessions[id].send(event.data);
			}
		});

		server.addEventListener('close', (cls: CloseEvent) => {
			delete this.sessions[id];
			server.close(cls.code);
		});

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const { searchParams, pathname } = new URL(request.url);

		if (pathname.endsWith('/ws')) {
			// Expect to receive a WebSocket Upgrade request.
			// If there is one, accept the request and return a WebSocket Response.
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Durable Object expected Upgrade: websocket', { status: 426 });
			}

			// This example will refer to the same Durable Object instance,
			// since the name "foo" is hardcoded.
			let name = searchParams.get('name') || 'foo';
			let id = env.MY_DURABLE_OBJECT.idFromName(name);
			let stub = env.MY_DURABLE_OBJECT.get(id);

			return stub.fetch(request);
		}

		if (pathname.endsWith('/datachannel')) {
			return new Response(dataChannelPage.replace('APP_ID_PLACEHOLDER', env.APP_ID).replace('APP_TOKEN_PLACEHOLDER', env.APP_TOKEN), {
				headers: { 'Content-Type': 'text/html;charset=UTF-8' },
			});
		}

		if (pathname.endsWith('/websocket')) {
			return new Response(websocketPage, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
		}

		if (pathname.endsWith('/combine')) {
			return new Response(combinePage.replace('APP_ID_PLACEHOLDER', env.APP_ID).replace('APP_TOKEN_PLACEHOLDER', env.APP_TOKEN), {
				headers: { 'Content-Type': 'text/html;charset=UTF-8' },
			});
		}

		return new Response(null, {
			status: 400,
			statusText: 'Bad Request',
			headers: {
				'Content-Type': 'text/plain',
			},
		});
	},
};
