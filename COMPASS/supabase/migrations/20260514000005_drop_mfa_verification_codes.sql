-- PR5b — Wycofanie własnego MFA na rzecz Microsoft Entra Conditional Access.
--
-- Po PR5a (wymuszenie Azure SSO dla @b2bnetwork.pl) + Cfg (CA z MFA via
-- Microsoft Authenticator), tabela verification_codes nie jest już
-- używana. Aplikacja kod `lib/mfa.ts` został usunięty.
--
-- Audit log events (MFA_SENT, MFA_VERIFY) zachowujemy w audit_logs —
-- historia compliance/SIEM nie powinna ginąć. Typ AuditAction zostaje
-- bez zmian żeby istniejące rekordy dalej parsowały się.

DROP TABLE IF EXISTS verification_codes;

-- Optional: archive MFA audit events do osobnej tabeli (jeśli kto chce
-- separować historyczne MFA od bieżącego audit logu). Skip by default —
-- audit_logs nie jest tak duże by to było potrzebne.
-- CREATE TABLE IF NOT EXISTS audit_logs_archive_mfa AS
--     SELECT * FROM audit_logs WHERE action IN ('MFA_SENT', 'MFA_VERIFY');
