import { zxcvbn } from "@zxcvbn-ts/core";

export type PasswordStrengthValidation = {
  valid: boolean;
  feedback: string;
};

export function validatePasswordStrength(password: string): PasswordStrengthValidation {
  const validationResult = zxcvbn(password);

  if (validationResult.score < 3) {
    const warning = validationResult.feedback.warning?.trim();
    const suggestions = validationResult.feedback.suggestions
      .map((suggestion) => suggestion.trim())
      .filter(Boolean)
      .join(" ");
    const feedback =
      [warning, suggestions].filter(Boolean).join(" ").trim() ||
      "Use a longer and more unique password.";

    return {
      valid: false,
      feedback,
    };
  }

  return {
    valid: true,
    feedback: "",
  };
}
