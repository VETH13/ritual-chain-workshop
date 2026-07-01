"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Twitter, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onLogin: (handle: string) => Promise<boolean>;
  loading: boolean;
};

export function XLoginModal({ onLogin, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");

  const submit = async () => {
    const clean = handle.replace(/^@/, "").trim();
    if (!clean) {
      toast.error("Please enter your X handle");
      return;
    }
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(clean)) {
      toast.error("Invalid X handle (max 15 chars, alphanumeric + underscore)");
      return;
    }
    const ok = await onLogin(clean);
    if (ok) {
      setOpen(false);
      setHandle("");
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="gap-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/30"
      >
        <Twitter className="h-4 w-4" />
        Login with X
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-sky-500/30 bg-slate-950/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sky-300">
              <Twitter className="h-5 w-5" />
              Connect your X account
            </DialogTitle>
            <DialogDescription>
              Enter your X (Twitter) handle to use your avatar as the in-game
              character and unlock PvP matchmaking with friends.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="x-handle" className="text-slate-300">
                X Handle
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">@</span>
                <Input
                  id="x-handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="elonmusk"
                  className="border-slate-700 bg-slate-900/60 font-mono text-sky-100"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500">
                We fetch your public avatar via unavatar.io. No password, no
                OAuth needed for demo.
              </p>
            </div>
            <Button
              onClick={submit}
              disabled={loading}
              className="w-full gap-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Twitter className="h-4 w-4" />
              )}
              {loading ? "Connecting..." : "Connect & Play"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
