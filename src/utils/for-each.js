/* eslint-disable no-plusplus, no-restricted-syntax */
import isArguments from 'is-arguments';
import isObject from 'is-object';

export default function forEach(collection, iteratee) {
    if (!collection) {
        return null;
    }

    if (Array.isArray(collection) || isArguments(collection)) {
        let index = -1;
        const length = collection.length;

        while (++index < length) {
            if (iteratee(collection[index], index, collection) === false) {
                break;
            }
        }
    } else if (isObject(collection)) {
        for (const key in collection) {
            if (hasOwnProperty.call(collection, key) && key !== 'constructor') {
                if (iteratee(collection[key], key, collection) === false) {
                    break;
                }
            }
        }
    }

    return collection;
}
