type SendPayload = {
  from?: string;
  html?: string;
  subject?: string;
  to?: string | string[];
};

const resendState = {
  calls: [] as SendPayload[],
  response: { error: null as { message: string } | null },
};

export class Resend {
  emails = {
    send: async (payload: SendPayload) => {
      resendState.calls.push(payload);
      return resendState.response;
    },
  };
}

export function __getResendCalls() {
  return [...resendState.calls];
}

export function __resetResendMock() {
  resendState.calls.length = 0;
  resendState.response = { error: null };
}

export function __setResendResponse(response: { error: { message: string } | null }) {
  resendState.response = response;
}
