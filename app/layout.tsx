import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"StreamVault — Catalog Intelligence",description:"Maintain, validate, analyze, prove, and reuse your catalog data.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
