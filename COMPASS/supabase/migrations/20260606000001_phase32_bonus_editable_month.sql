-- Phase 32 — pozwól finanse/adminowi skorygować MIESIĄC standardowej premii po przypisaniu.
--
-- Kontekst: po Phase 26 (status 'assigned' jako stan terminalny) okres premii był
-- twardo niezmienny — DB trigger `enforce_bonus_stage_transitions` blokował zmianę
-- period_year/period_month na premii 'assigned' ("Cannot change period..."), a UI
-- renderowało pole miesiąca jako read-only. Finanse (Michał) zgłosili, że nie mogą
-- poprawić błędnie wpisanego miesiąca (np. maj → kwiecień) — pole jest nieaktywne,
-- jedyną drogą był cancel + ponowne przypisanie (mylący e-mail "premia anulowana").
--
-- Zmiana: dla premii standardowych (kategorie sales/delivery_lead/recruiter/custom)
-- period_year + period_month stają się edytowalne na premii 'assigned'. Edycja jest
-- ograniczona do finanse/admina w warstwie server action (requireFinanseOrAdminAction,
-- Phase 32 manager-lock). Champions League pozostaje BEZ zmian — kwartał, miejsce i rok
-- są niezmienne (unikalność (year, quarter, rank) + semantyka miejsca; CL edytujemy
-- osobnym formularzem). Odbiorca i kategoria nadal niezmienne dla wszystkich premii.
--
-- Bez kolizji unikalności: partial UNIQUE `bonuses_one_per_recipient_period` został
-- zdjęty w Phase 27e (duplikaty per miesiąc są dozwolone), więc przeniesienie premii
-- na inny miesiąc nie narusza żadnego constraintu (poza CL, którego nie dotyczy).
--
-- `CREATE OR REPLACE` nadpisuje całe ciało funkcji z Phase 31 — pozostałe reguły
-- (INSERT, assigned → cancelled, legacy pending/paid) zachowane 1:1.

CREATE OR REPLACE FUNCTION enforce_bonus_stage_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- INSERT: new path only allows status='assigned' with required period fields.
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'assigned' THEN
            RAISE EXCEPTION 'New bonuses must start in status=assigned (got: %). Legacy pending path closed in Phase 26.', NEW.status
                USING ERRCODE = 'P0001';
        END IF;
        -- Phase 31: champions_league wymaga period_year + period_quarter (NIE period_month).
        IF NEW.category = 'champions_league' THEN
            IF NEW.period_year IS NULL OR NEW.period_quarter IS NULL THEN
                RAISE EXCEPTION 'champions_league bonuses require period_year and period_quarter'
                    USING ERRCODE = 'P0001';
            END IF;
            IF NEW.place_rank IS NULL THEN
                RAISE EXCEPTION 'champions_league bonuses require place_rank (1/2/3)'
                    USING ERRCODE = 'P0001';
            END IF;
            IF NEW.period_month IS NOT NULL THEN
                RAISE EXCEPTION 'champions_league bonuses must have period_month NULL (use period_quarter instead)'
                    USING ERRCODE = 'P0001';
            END IF;
        ELSE
            IF NEW.period_year IS NULL OR NEW.period_month IS NULL THEN
                RAISE EXCEPTION 'Assigned bonuses require period_year and period_month'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        IF NEW.linked_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'Assigned bonuses cannot have linked_invoice_id (invoice workflow disabled in Phase 26)'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: if status unchanged, allow column updates but guard immutable fields.
    IF OLD.status = NEW.status THEN
        IF OLD.status = 'assigned' THEN
            IF OLD.recipient_user_id IS DISTINCT FROM NEW.recipient_user_id THEN
                RAISE EXCEPTION 'Cannot change recipient_user_id on an assigned bonus'
                    USING ERRCODE = 'P0001';
            END IF;
            IF OLD.category IS DISTINCT FROM NEW.category THEN
                RAISE EXCEPTION 'Cannot change category on an assigned bonus'
                    USING ERRCODE = 'P0001';
            END IF;
            -- Phase 31/32: Champions League — kwartał, miejsce i rok niezmienne.
            -- Standardowe premie miesięczne — period_year/period_month edytowalne (Phase 32),
            -- ale muszą pozostać niepuste.
            IF NEW.category = 'champions_league' THEN
                IF OLD.period_year IS DISTINCT FROM NEW.period_year
                    OR OLD.period_quarter IS DISTINCT FROM NEW.period_quarter
                    OR OLD.place_rank IS DISTINCT FROM NEW.place_rank THEN
                    RAISE EXCEPTION 'Cannot change period_year, period_quarter or place_rank on an assigned champions_league bonus (create a new one)'
                        USING ERRCODE = 'P0001';
                END IF;
            ELSE
                IF NEW.period_year IS NULL OR NEW.period_month IS NULL THEN
                    RAISE EXCEPTION 'Assigned bonuses require period_year and period_month'
                        USING ERRCODE = 'P0001';
                END IF;
            END IF;
            IF NEW.linked_invoice_id IS NOT NULL THEN
                RAISE EXCEPTION 'Assigned bonuses cannot have linked_invoice_id (invoice workflow disabled in Phase 26)'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        IF OLD.status = 'paid' AND OLD.linked_invoice_id IS DISTINCT FROM NEW.linked_invoice_id THEN
            RAISE EXCEPTION 'Cannot change linked_invoice_id on a paid bonus'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- assigned → cancelled
    IF OLD.status = 'assigned' AND NEW.status = 'cancelled' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
        RETURN NEW;
    END IF;

    -- Legacy: pending → paid (requires linked_invoice_id, invoice owned by recipient).
    IF OLD.status = 'pending' AND NEW.status = 'paid' THEN
        IF NEW.linked_invoice_id IS NULL THEN
            RAISE EXCEPTION 'Cannot mark bonus paid without linked_invoice_id'
                USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.id = NEW.linked_invoice_id
              AND i.user_id = NEW.recipient_user_id
        ) THEN
            RAISE EXCEPTION 'linked_invoice_id must reference an invoice owned by recipient_user_id'
                USING ERRCODE = 'P0001';
        END IF;
        NEW.paid_at := COALESCE(NEW.paid_at, NOW());
        RETURN NEW;
    END IF;

    -- Legacy: pending → cancelled
    IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
        RETURN NEW;
    END IF;

    -- Legacy: paid → pending (unlink path)
    IF OLD.status = 'paid' AND NEW.status = 'pending' THEN
        IF NEW.linked_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'Unlinking a paid bonus requires clearing linked_invoice_id'
                USING ERRCODE = 'P0001';
        END IF;
        NEW.paid_at := NULL;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid bonus status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
END;
$$;
