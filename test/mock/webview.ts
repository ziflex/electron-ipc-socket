/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { TransportInput, TransportOutput } from '../../src/transport';
import { createElement } from './element';

export function create(ipc: TransportInput & TransportOutput): any {
    const webview = createElement('div');

    webview.addEventListener = (eventName, eventHandler) => {
        ipc.on(eventName, eventHandler);
    };

    webview.removeEventListener = (eventName, eventHandler) => {
        ipc.removeListener(eventName, eventHandler);
    };

    (webview as any).send = (eventName, data) => {
        ipc.send(eventName, data);
    };

    return webview;
}
