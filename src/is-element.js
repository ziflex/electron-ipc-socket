import isFunction from 'is-function';

function toString(value) {
    if (isFunction(value.toString)) {
        return value.toString();
    }

    return Object.prototype.toString.call(value);
}

export default function isElement(value) {
    return (value && value.nodeType === 1) &&
            (value && typeof value === 'object') &&
            (toString(value).indexOf('Element') > -1);
}
