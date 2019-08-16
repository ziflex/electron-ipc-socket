/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { JSDOM } from 'jsdom';

export function createElement(type: string): HTMLElement {
    const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);

    return dom.window.document.createElement(type);
}
