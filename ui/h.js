// ui/h.js
// Shared view primitives. Preact + htm via esm.sh, exact-version pinned and on a
// single origin so DNS/TLS/HTTP-2 connections are reused (section 10). No JSX, no
// build step: htm parses the tagged templates at runtime.

import { h, render, Fragment } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect, useRef, useMemo, useCallback } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useRef, useMemo, useCallback };
