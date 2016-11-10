/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { jsdom } from 'jsdom';

export default function create(type) {
    return jsdom().defaultView.document.createElement(type);
}
