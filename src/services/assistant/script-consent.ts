// Consent to run AI-generated map scripts: asked once per session, a new chat asks again

let consentGiven = false;

export const hasScriptConsent = (): boolean => consentGiven;

export function giveScriptConsent(): void {
  consentGiven = true;
}

export function resetScriptConsent(): void {
  consentGiven = false;
}
