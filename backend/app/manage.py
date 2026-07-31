"""Out-of-band administrative commands.

The admin role is granted here and nowhere else. Running this requires shell
and database access, which is the point: no HTTP request — authenticated or
not — can escalate a user to admin.

    python -m app.manage list-admins
    python -m app.manage grant-admin owner@example.com
    python -m app.manage revoke-admin owner@example.com
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_maker, close_db
from app.core.security_log import log_security_event
from app.models.models import User


async def _find_user(session, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.strip().lower()))
    return result.scalar_one_or_none()


async def list_admins() -> int:
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).where(User.role == "admin").order_by(User.email)
        )
        admins = list(result.scalars().all())

    if not admins:
        print("No administrators configured.")
        print("Grant one with: python -m app.manage grant-admin <email>")
        return 0

    print(f"{len(admins)} administrator(s):")
    for user in admins:
        last_login = user.last_login_at.isoformat(sep=" ", timespec="seconds") if user.last_login_at else "never"
        print(f"  {user.email:<40} {user.full_name:<25} last login: {last_login}")
    return 0


async def set_role(email: str, role: str, *, assume_yes: bool) -> int:
    async with async_session_maker() as session:
        user = await _find_user(session, email)
        if user is None:
            print(f"No account found for {email!r}.", file=sys.stderr)
            print("The user must register through the app first.", file=sys.stderr)
            return 1

        if (user.role or "user") == role:
            print(f"{user.email} already has role {role!r}. Nothing to do.")
            return 0

        # Show who is actually being promoted: the operator should confirm the
        # account is the person they think it is, not just a matching address.
        print(f"  email      : {user.email}")
        print(f"  name       : {user.full_name}")
        print(f"  company    : {user.company_name}")
        print(f"  registered : {user.created_at}")
        print(f"  verified   : {'yes' if user.email_verified else 'NO'}")
        print(f"  role       : {user.role or 'user'}  ->  {role}")

        # The admin role only takes effect once the address is verified, so
        # say so here rather than letting the operator wonder why the grant
        # appeared to do nothing.
        if role == "admin" and not user.email_verified and settings.REQUIRE_VERIFIED_EMAIL_FOR_ADMIN:
            print(
                "\n  NOTE: this address is not verified yet, so the role stays "
                "inactive until\n        the user clicks the confirmation link "
                "(Settings -> resend if needed)."
            )

        if not assume_yes:
            answer = input(f"\nSet role to {role!r} for this account? [y/N] ").strip().lower()
            if answer not in {"y", "yes"}:
                print("Aborted.")
                return 1

        previous = user.role or "user"
        user.role = role
        # A privilege change also ends the user's current session, so the new
        # role takes effect on a fresh sign-in and any hijacked session dies.
        user.session_id = None
        user.session_started_at = None
        user.refresh_token_hash = None
        user.refresh_token_expires_at = None
        await session.commit()

        log_security_event(
            "admin.role_change",
            user_id=user.id,
            email=user.email,
            previous_role=previous,
            new_role=role,
            source="cli",
        )

    print(f"\n{email} is now {role!r}. They must sign in again.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.manage", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list-admins", help="List accounts holding the admin role")

    grant = sub.add_parser("grant-admin", help="Grant the admin role to an existing account")
    grant.add_argument("email")
    grant.add_argument("-y", "--yes", action="store_true", help="Skip the confirmation prompt")

    revoke = sub.add_parser("revoke-admin", help="Revoke the admin role")
    revoke.add_argument("email")
    revoke.add_argument("-y", "--yes", action="store_true", help="Skip the confirmation prompt")

    args = parser.parse_args(argv)

    async def run() -> int:
        try:
            if args.command == "list-admins":
                return await list_admins()
            if args.command == "grant-admin":
                return await set_role(args.email, "admin", assume_yes=args.yes)
            return await set_role(args.email, "user", assume_yes=args.yes)
        finally:
            await close_db()

    return asyncio.run(run())


if __name__ == "__main__":
    raise SystemExit(main())
