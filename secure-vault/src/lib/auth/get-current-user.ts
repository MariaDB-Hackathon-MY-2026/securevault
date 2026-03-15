'use server'

import {cookies} from "next/headers";
import {validateSession} from "@/lib/auth/session";

export async function getCurrentUser(){
    const request_cookie_context = await cookies()

    const session_token = request_cookie_context.get('__Secure-session')?.value

    if(!session_token) return null
    const user = await validateSession(session_token)
    return user


}