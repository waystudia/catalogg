import{c as n}from"./createLucideIcon-BKyNUYkI.js";import{n as r,s as a}from"./index-DxPy2ZeP.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=n("ChevronLeft",[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]]);async function u(s){if(!a)return{hasSession:!0,isPlatformAdmin:!0,email:"local@catalog.app"};const t=s!==void 0?s:(await a.auth.getSession()).data.session;if(!t)return{hasSession:!1,isPlatformAdmin:!1,email:null};const{data:e,error:i}=await a.rpc("is_platform_admin");return{hasSession:!0,isPlatformAdmin:!i&&!!e,email:t.user.email??null}}async function f(){r(),a&&await a.auth.signOut()}export{l as C,u as g,f as s};
