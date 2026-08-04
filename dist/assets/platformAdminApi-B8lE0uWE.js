import{c as n}from"./createLucideIcon-1Wj2SOHA.js";import{h as o,s as a,k as m}from"./index-BysbJl94.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=n("ChevronLeft",[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]]);async function i(s){if(!a)return{hasSession:!0,isPlatformAdmin:!0,email:"local@catalog.app"};const t=s!==void 0?s:(await a.auth.getSession()).data.session;if(!t)return{hasSession:!1,isPlatformAdmin:!1,email:null};const{data:r,error:e}=await a.rpc("is_platform_admin");return{hasSession:!0,isPlatformAdmin:!e&&!!r,email:t.user.email??null}}async function c(s,t){if(!a)return i();const{data:r,error:e}=await a.auth.signInWithPassword({email:s.trim().toLowerCase(),password:t});if(e)throw new Error(e.message);return m("platform-admin"),i(r.session)}async function d(){o(),a&&await a.auth.signOut()}export{f as C,c as a,i as g,d as s};
