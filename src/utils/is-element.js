import isFunction from 'is-function';
import isObject from 'is-object';

function toString(value) {
    if (isFunction(value.toString)) {
        return value.toString();
    }

    return Object.prototype.toString.call(value);
}

export default function isElement(value) {
    return (value && value.nodeType === 1) &&
            (isObject(value)) &&
            (toString(value).indexOf('Element') > -1);
}
