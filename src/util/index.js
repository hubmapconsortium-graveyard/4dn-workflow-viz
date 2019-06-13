'use strict';

import * as objectMethods from './object';
import * as layoutMethods from './layout';
import * as ajaxMethods from './ajax';
import * as typeDefinitions from './typedefs';
import * as JWTMethods from './json-web-token';
import * as DateUtilities from './date-utility';
import * as experimentTransformFunctions from './experiments-transforms';
import * as experimentFilters from './experiments-filters';
import * as SchemaUtilities from './Schemas';
import * as fileUtilities from './file';
import patchedConsoleInstance from './patched-console';

/**
 * A directory of methods and maybe a mini-component or two for common use.
 *
 * @module util
 */


// Misc functions are top-level
export {isServerSide} from './misc';

// Transforms, manipulations, parsers, etc. re: objects.
export const object = objectMethods;

// Navigation
export {navigate} from './navigate';

// Layout
export const layout = layoutMethods;

// AJAX
export const ajax = ajaxMethods;

// Type definitions
export const typedefs = typeDefinitions;

// Functions related to JWT encoding/decoding/storage. Prevent name interference with 'jwt' NPM package.
export const JWT = JWTMethods;

// Use momentjs to parse and local	ize datetime.
// Has useful React component - DateUtility.LocalizedTime - which shows time in user's timezone after mount.
export const DateUtility = DateUtilities;

export const expFxn = experimentTransformFunctions;

export const Filters = experimentFilters;

export {itemTypeHierarchy} from './itemTypeHierarchy';

export const Schemas = SchemaUtilities;

// Transforms, manipulations, parsers, etc. re: objects.
export const fileUtil = fileUtilities;

export const console = patchedConsoleInstance;
