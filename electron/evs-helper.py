# Talks to castLabs EVS for the About popup's DRM setup (see electron/drm.cjs).
#
# Runs in .venv-evs, where `npm run evs:setup` (or the About popup) installed
# castlabs-evs. Reads one JSON request on stdin and prints one JSON reply on
# stdout, so passwords never show up in the process list. EVS's own messages go
# to stderr, which ends up in the terminal.
#
# Requests: { "op": ..., ... }
#   status   { pkg }                                   -> { signed, daysLeft, reason, accountName }
#   signup   { accountName, password, email, firstName, lastName, organization }
#   resend   { accountName }
#   confirm  { accountName, password, code }           (also signs in)
#   signin   { accountName, password }
#   sign     { pkg }                                   (uses the saved sign-in)
# Replies: { "ok": true, ... } or { "ok": false, "code": ..., "message": ... }
import io
import json
import re
import sys
from contextlib import redirect_stdout


def error_code(err):
    """The AWS Cognito error code (like CodeMismatchException), or the exception's class name."""
    e = err
    while e is not None:
        code = getattr(e, 'response', None)
        code = code.get('Error', {}).get('Code') if isinstance(code, dict) else None
        if code:
            return code
        e = e.__cause__ or e.__context__
    return type(err).__name__


def error_message(err):
    e = err
    while e is not None:
        response = getattr(e, 'response', None)
        if isinstance(response, dict) and response.get('Error', {}).get('Message'):
            return response['Error']['Message']
        e = e.__cause__ or e.__context__
    return str(err)


def run(req):
    from castlabs_evs.account import Account
    from castlabs_evs.vmp import VMP

    op = req.get('op')
    if op == 'status':
        vmp = VMP(no_ask=True)
        reply = {'ok': True, 'accountName': vmp._auth_account_name if vmp._auth_refresh_token else None}
        log = io.StringIO()
        try:
            with redirect_stdout(log):
                vmp.verify_pkg(req['pkg'])
            days = re.search(r'(\d+) days left', log.getvalue())
            reply.update(signed=True, daysLeft=int(days.group(1)) if days else None)
        except Exception as e:
            reply.update(signed=False, reason=str(e))
        return reply

    if op == 'signup':
        Account(no_ask=True).signup(
            account_name=req['accountName'],
            passwd=req['password'],
            email=req['email'],
            first_name=req['firstName'],
            last_name=req['lastName'],
            organization=req['organization'],
            no_confirm=True,
        )
    elif op == 'resend':
        Account(no_ask=True).resend(account_name=req['accountName'], no_confirm=True)
    elif op == 'confirm':
        Account(no_ask=True).confirm_signup(account_name=req['accountName'], passwd=req['password'], code=req['code'])
    elif op == 'signin':
        Account(no_ask=True).reauth(account_name=req['accountName'], passwd=req['password'])
    elif op == 'sign':
        VMP(no_ask=True).sign_pkg(req['pkg'])
    else:
        raise ValueError(f'Unknown request: {op}')
    return {'ok': True}


def main():
    reply_to = sys.stdout
    try:
        req = json.load(sys.stdin)
        with redirect_stdout(sys.stderr):
            reply = run(req)
    except Exception as e:
        reply = {'ok': False, 'code': error_code(e), 'message': error_message(e)}
    json.dump(reply, reply_to)
    reply_to.write('\n')


if __name__ == '__main__':
    main()
