"use client";

import { useEffect, useRef, useState } from "react";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { transcribeAudio } from "@/lib/api";

interface UseVoiceRecorderOptions {
  micErrorMessage: string;
  onTranscribed: (target: string, text: string) => void;
  onError: (msg: string) => void;
}

export function useVoiceRecorder({
  micErrorMessage,
  onTranscribed,
  onError,
}: UseVoiceRecorderOptions) {
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribingTarget, setTranscribingTarget] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const onTranscribedRef = useRef(onTranscribed);
  const onErrorRef = useRef(onError);
  const errorMessage = useErrorMessage();

  useEffect(() => {
    onTranscribedRef.current = onTranscribed;
    onErrorRef.current = onError;
  }, [onTranscribed, onError]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  useEffect(() => {
    if (!recordingTarget) return;
    const timer = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recordingTarget]);

  async function toggleVoiceRecording(target: string) {
    if (recordingTarget === target) {
      mediaRecorderRef.current?.stop();
      setRecordingTarget(null);
      return;
    }
    if (recordingTarget !== null) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        micStreamRef.current = null;
        const actualType = recorder.mimeType || "audio/webm";
        const ext = actualType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: actualType });
        if (blob.size < 500) return;

        setTranscribingTarget(target);
        try {
          const text = await transcribeAudio(blob, `voice.${ext}`, "auto");
          if (text) onTranscribedRef.current(target, text);
        } catch (err) {
          onErrorRef.current(errorMessage(err));
        } finally {
          setTranscribingTarget(null);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSeconds(0);
      setRecordingTarget(target);
    } catch {
      onErrorRef.current(micErrorMessage);
    }
  }

  return {
    recordingTarget,
    recordingSeconds,
    transcribingTarget,
    toggleVoiceRecording,
  };
}
