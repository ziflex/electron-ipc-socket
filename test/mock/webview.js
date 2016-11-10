/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import Element from './element';

export default function create(ipc) {
    const webview = Element('div');

    webview.addEventListener = (eventName, eventHandler) => {
        ipc.on(eventName, eventHandler);
    };

    webview.removeEventListener = (eventName, eventHandler) => {
        ipc.removeListener(eventName, eventHandler);
    };

    webview.send = (eventName, data) => {
        ipc.send(eventName, data);
    };

    return webview;
}
