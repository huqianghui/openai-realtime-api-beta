import { RealtimeEventHandler } from './event_handler.js';
import { RealtimeUtils } from './utils.js';

let URL;
if (typeof URL === 'undefined') {
  try {
    // Node.js env
    URL = (await import('node:url')).URL;
  } catch (error) {
    // Browser env
    URL = window.URL || global.URL;
  }
}

export class RealtimeAPI extends RealtimeEventHandler {
  /**
   * Create a new RealtimeAPI instance
   * @param {{url?: string, apiKey?: string, dangerouslyAllowAPIKeyInBrowser?: boolean, debug?: boolean}} [settings]
   * @returns {RealtimeAPI}
   */
  constructor({ url, apiKey, dangerouslyAllowAPIKeyInBrowser, debug } = {}) {
    super();
    this.defaultUrl = 'wss://api.openai.com/v1/realtime';
    this.apiKey = apiKey || null;
    this.debug = !!debug;
    this.ws = null;

    if(url){
      // get urlApiKey if URL already has 'api-key'
      const urlObj = new URL(url) 
      let urlApiKey = urlObj.searchParams.get('api-key'); 
      
      // Check if URL already has 'api-key' parameter or apiKey is provided
      if (!urlApiKey && !apiKey) {
        throw new Error('API key must be provided either in the URL or as a separate parameter');
        // Check if URL already has 'api-key' parameter and apiKey is provided and they don't match
      } else if (urlApiKey && apiKey && urlApiKey !== apiKey) {
        throw new Error('API key in URL does not match the provided API key');
      } else {
        // Set apiKey to urlApiKey if it exists
        this.apiKey = urlApiKey || apiKey;
      }
      
      // if urlApiKey is not present, set it
      if (!urlApiKey) {
        urlObj.searchParams.set('api-key', this.apiKey);
      }

      this.url = urlObj.toString();
    }else{
      this.url = defaultUrl;
    }

    if (globalThis.document && this.apiKey) {
      if (!dangerouslyAllowAPIKeyInBrowser) {
        throw new Error(
          `Can not provide API key in the browser without "dangerouslyAllowAPIKeyInBrowser" set to true`,
        );
      }
    }
  }

  /**
   * Tells us whether or not the WebSocket is connected
   * @returns {boolean}
   */
  isConnected() {
    return !!this.ws;
  }

  /**
   * Writes WebSocket logs to console
   * @param  {...any} args
   * @returns {true}
   */
  log(...args) {
    const date = new Date().toISOString();
    const logs = [`[Websocket/${date}]`].concat(args).map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg, null, 2);
      } else {
        return arg;
      }
    });
    if (this.debug) {
      console.log(...logs);
    }
    return true;
  }

  /**
   * Connects to Realtime API Websocket Server
   * @param {{model?: string}} [settings]
   * @returns {Promise<true>}
   */
  async connect({ model } = { model: 'gpt-4o-realtime-preview-2024-10-01' }) {
    if (this.isConnected()) {
      throw new Error(`Already connected`);
    }
    if (globalThis.document) {
      /**
       * Web browser
       */

      const urlObj = new URL(this.url);
      const searchParams = urlObj.searchParams;

      // Check if URL already has 'model' or 'deployment' parameters,
      // or if the hostname includes 'openai.azure.com'
      if (!searchParams.has('model') && !searchParams.has('deployment') && !urlObj.hostname.includes('openai.azure.com')) {
        if (model) {
          urlObj.searchParams.append('model', model);
        }
      }
      const WebSocket = globalThis.WebSocket;
      //TODO subprotocol seems not to be workiing for aoai
      const ws = new WebSocket(
        urlObj.toString(),
        [],
        {
          finishRequest: (request) => {
            // Auth
            request.setHeader('Authorization', `Bearer ${this.apiKey}`);
            request.setHeader('OpenAI-Beta', 'realtime=v1');
            request.end();
          },
        },
      );
      ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        this.receive(message.type, message);
      });
      return new Promise((resolve, reject) => {
        const connectionErrorHandler = () => {
          this.disconnect(ws);
          reject(new Error(`Could not connect to "${this.url}"`));
        };
        ws.addEventListener('error', connectionErrorHandler);
        ws.addEventListener('open', () => {
          this.log(`Connected to "${this.url}"`);
          ws.removeEventListener('error', connectionErrorHandler);
          ws.addEventListener('error', () => {
            this.disconnect(ws);
            this.log(`Error, disconnected from "${this.url}"`);
            this.dispatch('close', { error: true });
          });
          ws.addEventListener('close', () => {
            this.disconnect(ws);
            this.log(`Disconnected from "${this.url}"`);
            this.dispatch('close', { error: false });
          });
          this.ws = ws;
          resolve(true);
        });
      });
    } else {
      /**
       * Node.js
       */
      const moduleName = 'ws';
      const wsModule = await import(/* webpackIgnore: true */ moduleName);
      const WebSocket = wsModule.default;
      const websocketUrl = this.url || 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';

      const ws = new WebSocket(
        websocketUrl,
        [],
        {
          finishRequest: (request) => {
            // Auth
            request.setHeader('Authorization', `Bearer ${this.apiKey}`);
            request.setHeader('OpenAI-Beta', 'realtime=v1');
            request.end();
          },
        },
      );
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.receive(message.type, message);
      });
      return new Promise((resolve, reject) => {
        const connectionErrorHandler = () => {
          this.disconnect(ws);
          reject(new Error(`Could not connect to "${this.url}"`));
        };
        ws.on('error', connectionErrorHandler);
        ws.on('open', () => {
          this.log(`Connected to "${this.url}"`);
          ws.removeListener('error', connectionErrorHandler);
          ws.on('error', () => {
            this.disconnect(ws);
            this.log(`Error, disconnected from "${this.url}"`);
            this.dispatch('close', { error: true });
          });
          ws.on('close', () => {
            this.disconnect(ws);
            this.log(`Disconnected from "${this.url}"`);
            this.dispatch('close', { error: false });
          });
          this.ws = ws;
          resolve(true);
        });
      });
    }
  }

  /**
   * Disconnects from Realtime API server
   * @param {WebSocket} [ws]
   * @returns {true}
   */
  disconnect(ws) {
    if (!ws || this.ws === ws) {
      this.ws && this.ws.close();
      this.ws = null;
      return true;
    }
  }

  /**
   * Receives an event from WebSocket and dispatches as "server.{eventName}" and "server.*" events
   * @param {string} eventName
   * @param {{[key: string]: any}} event
   * @returns {true}
   */
  receive(eventName, event) {
    this.log(`received:`, eventName, event);
    this.dispatch(`server.${eventName}`, event);
    this.dispatch('server.*', event);
    return true;
  }

  /**
   * Sends an event to WebSocket and dispatches as "client.{eventName}" and "client.*" events
   * @param {string} eventName
   * @param {{[key: string]: any}} event
   * @returns {true}
   */
  send(eventName, data) {
    if (!this.isConnected()) {
      throw new Error(`RealtimeAPI is not connected`);
    }
    data = data || {};
    if (typeof data !== 'object') {
      throw new Error(`data must be an object`);
    }
    const event = {
      event_id: RealtimeUtils.generateId('evt_'),
      type: eventName,
      ...data,
    };
    this.dispatch(`client.${eventName}`, event);
    this.dispatch('client.*', event);
    this.log(`sent:`, eventName, event);
    this.ws.send(JSON.stringify(event));
    return true;
  }
}
