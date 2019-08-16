import { RequiredError } from '../errors/required';

export interface ErrorConstructor {
    new (): any;
}

/**
 * Checks for a condition; if the condition is false,
 * follows the escalation policy set for the analyzer.
 * @param {string} message - A message to display if the condition is not met..
 * @param {boolean} condition - The condition to check.
 */
export function assert(err: ErrorConstructor, condition: boolean): void {
    if (!condition) {
        throw new err();
    }
}

/**
 * Specifies a precondition contract for the enclosing method or property,
 * and displays a message if the condition for the contract fails.
 * @param {string} name - The method / property name to display if the condition is false.
 * @param {any} value - The conditional expression to test.
 */
export function requires(name: string, value: any): void {
    if (value == null) {
        throw new RequiredError(name);
    }
}
