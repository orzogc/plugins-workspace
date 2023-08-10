import { invoke, transformCallback } from "@tauri-apps/api/tauri";

export interface ConnectionConfig {
  writeBufferSize?: number;
  maxWriteBufferSize?: number;
  maxMessageSize?: number;
  maxFrameSize?: number;
  acceptUnmaskedFrames?: boolean;
  headers?: HeadersInit;
}

export interface MessageKind<T, D> {
  type: T;
  data: D;
}

export interface CloseFrame {
  code: number;
  reason: string;
}

export type Message =
  | MessageKind<"Text", string>
  | MessageKind<"Binary", number[]>
  | MessageKind<"Ping", number[]>
  | MessageKind<"Pong", number[]>
  | MessageKind<"Close", CloseFrame | null>;

export type ListenerArgument = Message | MessageKind<"Error", string> | null;

export default class WebSocket {
  id: number;
  private readonly listeners: Array<(arg: ListenerArgument) => void>;

  constructor(id: number, listeners: Array<(arg: ListenerArgument) => void>) {
    this.id = id;
    this.listeners = listeners;
  }

  static async connect(
    url: string,
    config?: ConnectionConfig,
  ): Promise<WebSocket> {
    const listeners: Array<(arg: ListenerArgument) => void> = [];
    const handler = (message: ListenerArgument): void => {
      listeners.forEach((l) => l(message));
    };

    if (config?.headers) {
      config.headers = Array.from(new Headers(config.headers).entries());
    }

    return await invoke<number>("plugin:websocket|connect", {
      url,
      callbackFunction: transformCallback(handler),
      config,
    }).then((id) => new WebSocket(id, listeners));
  }

  addListener(cb: (arg: ListenerArgument) => void): void {
    for (const listener of this.listeners) {
      if (listener === cb) {
        return;
      }
    }

    this.listeners.push(cb);
  }

  removeListener(cb: (arg: ListenerArgument) => void): void {
    const index = this.listeners.indexOf(cb);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  async send(message: Message | string | number[]): Promise<void> {
    let m: Message;
    if (typeof message === "string") {
      m = { type: "Text", data: message };
    } else if (typeof message === "object" && "type" in message) {
      m = message;
    } else if (Array.isArray(message)) {
      m = { type: "Binary", data: message };
    } else {
      throw new Error(
        "invalid `message` type, expected a `{ type: string, data: any }` object, a string or a numeric array",
      );
    }
    return await invoke("plugin:websocket|send", {
      id: this.id,
      message: m,
    });
  }

  async disconnect(): Promise<void> {
    return await this.send({
      type: "Close",
      data: {
        code: 1000,
        reason: "Disconnected by client",
      },
    });
  }
}
