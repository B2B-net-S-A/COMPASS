-- ============================================================================
-- Phase 46a — Mapa technologiczna: słowniki (technologies, vendors) + obszary klientów
-- Date: 2026-08-03
-- Depends on:
--   - clients (phase27d) — client_areas to child-tabela ISTNIEJĄCEGO słownika klientów
--   - has_lifecycle_access() (phase22a, hardened phase45b) — RLS admin | talent_community | grant
--   - update_updated_at_column() [touch trigger fn]
-- What:
--   - technologies: słownik technologii ze STABILNYM slug (kotwica pod przyszły sync
--     z NEXUS — slug jest niezmienny przy rename), aliasami (k8s → Kubernetes),
--     kategorią i flagą is_verified (tag-picker dodaje FALSE, admin weryfikuje).
--     Seed ~130 zweryfikowanych pozycji.
--   - vendors: słownik firm-dostawców (konkurencja u klientów), flaga is_verified.
--   - client_areas: departament/obszar klienta (child clients, UNIQUE per klient).
-- Visibility: RLS = has_lifecycle_access() (TCM + admin + grant has_tcm_access),
--   split SELECT/INSERT/UPDATE bez DELETE (standard po audycie 2026-07-16 P1.15).
--   Zapisy idą service-rolem po guardzie requireLifecycleManagerAction().
-- ============================================================================

BEGIN;

-- ─── 1. technologies ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS technologies (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL CHECK (length(trim(name)) >= 1),
    -- Stabilny identyfikator pod integracje (NEXUS): generowany z nazwy przy
    -- utworzeniu, NIGDY nie zmieniany przy rename.
    slug         TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    aliases      TEXT[] NOT NULL DEFAULT '{}',
    category     TEXT NOT NULL DEFAULT 'inne' CHECK (category IN (
        'jezyk', 'chmura', 'dane', 'devops', 'security', 'inne'
    )),
    is_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_technologies_natural_key
    ON technologies (lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_technologies_unverified
    ON technologies (created_at) WHERE is_verified = FALSE;

DROP TRIGGER IF EXISTS trg_technologies_updated_at ON technologies;
CREATE TRIGGER trg_technologies_updated_at
    BEFORE UPDATE ON technologies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE technologies IS
    'Phase 46 — słownik technologii mapy technologicznej. slug = stabilny klucz pod sync z NEXUS (niezmienny przy rename).';

-- ─── 2. vendors ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL CHECK (length(trim(name)) >= 2),
    is_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_natural_key
    ON vendors (lower(trim(name)));

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vendors IS
    'Phase 46 — słownik firm-dostawców (inni dostawcy widziani u klientów).';

-- ─── 3. client_areas ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_areas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (length(trim(name)) >= 2),
    created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_areas_natural_key
    ON client_areas (client_id, lower(trim(name)));

COMMENT ON TABLE client_areas IS
    'Phase 46 — departament/obszar klienta (child ISTNIEJĄCEGO słownika clients — żadnej drugiej listy klientów).';

-- ─── 4. RLS (split, bez DELETE — standard po audycie 2026-07-16) ────────────

ALTER TABLE technologies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_areas  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "technologies_select_lifecycle" ON technologies;
CREATE POLICY "technologies_select_lifecycle" ON technologies
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "technologies_insert_lifecycle" ON technologies;
CREATE POLICY "technologies_insert_lifecycle" ON technologies
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
DROP POLICY IF EXISTS "technologies_update_lifecycle" ON technologies;
CREATE POLICY "technologies_update_lifecycle" ON technologies
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "vendors_select_lifecycle" ON vendors;
CREATE POLICY "vendors_select_lifecycle" ON vendors
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "vendors_insert_lifecycle" ON vendors;
CREATE POLICY "vendors_insert_lifecycle" ON vendors
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
DROP POLICY IF EXISTS "vendors_update_lifecycle" ON vendors;
CREATE POLICY "vendors_update_lifecycle" ON vendors
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "client_areas_select_lifecycle" ON client_areas;
CREATE POLICY "client_areas_select_lifecycle" ON client_areas
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "client_areas_insert_lifecycle" ON client_areas;
CREATE POLICY "client_areas_insert_lifecycle" ON client_areas
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
DROP POLICY IF EXISTS "client_areas_update_lifecycle" ON client_areas;
CREATE POLICY "client_areas_update_lifecycle" ON client_areas
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- ─── 5. Seed słownika technologii (~130 pozycji, is_verified=TRUE) ──────────
-- Idempotentny po slug. Nazwy kanoniczne; aliasy małymi literami (tag-picker
-- szuka po name + aliases, case-insensitive).

INSERT INTO technologies (name, slug, aliases, category, is_verified) VALUES
    -- Języki i frameworki aplikacyjne
    ('Java',            'java',            '{}'::text[],                                'jezyk',    TRUE),
    ('Kotlin',          'kotlin',          '{}'::text[],                                'jezyk',    TRUE),
    ('Python',          'python',          ARRAY['py'],                                 'jezyk',    TRUE),
    ('JavaScript',      'javascript',      ARRAY['js'],                                 'jezyk',    TRUE),
    ('TypeScript',      'typescript',      ARRAY['ts'],                                 'jezyk',    TRUE),
    ('C#',              'c-sharp',         ARRAY['csharp', 'c sharp'],                  'jezyk',    TRUE),
    ('.NET',            'dotnet',          ARRAY['dot net', '.net core', 'net core'],   'jezyk',    TRUE),
    ('Go',              'go',              ARRAY['golang'],                             'jezyk',    TRUE),
    ('Rust',            'rust',            '{}'::text[],                                'jezyk',    TRUE),
    ('C++',             'c-plus-plus',     ARRAY['cpp'],                                'jezyk',    TRUE),
    ('C',               'c',               '{}'::text[],                                'jezyk',    TRUE),
    ('PHP',             'php',             '{}'::text[],                                'jezyk',    TRUE),
    ('Ruby',            'ruby',            '{}'::text[],                                'jezyk',    TRUE),
    ('Scala',           'scala',           '{}'::text[],                                'jezyk',    TRUE),
    ('Swift',           'swift',           '{}'::text[],                                'jezyk',    TRUE),
    ('Objective-C',     'objective-c',     ARRAY['objc'],                               'jezyk',    TRUE),
    ('R',               'r',               '{}'::text[],                                'jezyk',    TRUE),
    ('Groovy',          'groovy',          '{}'::text[],                                'jezyk',    TRUE),
    ('COBOL',           'cobol',           '{}'::text[],                                'jezyk',    TRUE),
    ('PL/SQL',          'pl-sql',          ARRAY['plsql'],                              'jezyk',    TRUE),
    ('ABAP',            'abap',            '{}'::text[],                                'jezyk',    TRUE),
    ('Angular',         'angular',         ARRAY['angularjs'],                          'jezyk',    TRUE),
    ('React',           'react',           ARRAY['reactjs', 'react.js'],                'jezyk',    TRUE),
    ('Vue.js',          'vue-js',          ARRAY['vue', 'vuejs'],                       'jezyk',    TRUE),
    ('Next.js',         'next-js',         ARRAY['nextjs'],                             'jezyk',    TRUE),
    ('Node.js',         'node-js',         ARRAY['node', 'nodejs'],                     'jezyk',    TRUE),
    ('Spring',          'spring',          ARRAY['spring boot', 'springboot'],          'jezyk',    TRUE),
    ('Hibernate',       'hibernate',       '{}'::text[],                                'jezyk',    TRUE),
    ('Django',          'django',          '{}'::text[],                                'jezyk',    TRUE),
    ('Flask',           'flask',           '{}'::text[],                                'jezyk',    TRUE),
    ('FastAPI',         'fastapi',         '{}'::text[],                                'jezyk',    TRUE),
    ('Laravel',         'laravel',         '{}'::text[],                                'jezyk',    TRUE),
    ('Symfony',         'symfony',         '{}'::text[],                                'jezyk',    TRUE),
    ('Ruby on Rails',   'ruby-on-rails',   ARRAY['rails', 'ror'],                       'jezyk',    TRUE),
    ('NestJS',          'nestjs',          ARRAY['nest'],                               'jezyk',    TRUE),
    ('Express',         'express',         ARRAY['expressjs', 'express.js'],            'jezyk',    TRUE),
    ('Svelte',          'svelte',          '{}'::text[],                                'jezyk',    TRUE),
    ('Flutter',         'flutter',         '{}'::text[],                                'jezyk',    TRUE),
    ('React Native',    'react-native',    '{}'::text[],                                'jezyk',    TRUE),
    ('Android',         'android',         '{}'::text[],                                'jezyk',    TRUE),
    ('iOS',             'ios',             '{}'::text[],                                'jezyk',    TRUE),
    ('GraphQL',         'graphql',         '{}'::text[],                                'jezyk',    TRUE),
    -- Chmura
    ('AWS',             'aws',             ARRAY['amazon web services'],                'chmura',   TRUE),
    ('Azure',           'azure',           ARRAY['microsoft azure'],                    'chmura',   TRUE),
    ('Google Cloud',    'google-cloud',    ARRAY['gcp', 'google cloud platform'],       'chmura',   TRUE),
    ('OpenShift',       'openshift',       ARRAY['okd'],                                'chmura',   TRUE),
    ('OpenStack',       'openstack',       '{}'::text[],                                'chmura',   TRUE),
    ('VMware',          'vmware',          ARRAY['vsphere'],                            'chmura',   TRUE),
    ('Oracle Cloud',    'oracle-cloud',    ARRAY['oci'],                                'chmura',   TRUE),
    ('IBM Cloud',       'ibm-cloud',       '{}'::text[],                                'chmura',   TRUE),
    ('Heroku',          'heroku',          '{}'::text[],                                'chmura',   TRUE),
    ('Cloudflare',      'cloudflare',      '{}'::text[],                                'chmura',   TRUE),
    -- Dane
    ('PostgreSQL',      'postgresql',      ARRAY['postgres', 'psql'],                   'dane',     TRUE),
    ('MySQL',           'mysql',           '{}'::text[],                                'dane',     TRUE),
    ('MariaDB',         'mariadb',         '{}'::text[],                                'dane',     TRUE),
    ('Oracle Database', 'oracle-database', ARRAY['oracle', 'oracle db'],                'dane',     TRUE),
    ('SQL Server',      'sql-server',      ARRAY['mssql', 'ms sql', 'sqlserver'],       'dane',     TRUE),
    ('MongoDB',         'mongodb',         ARRAY['mongo'],                              'dane',     TRUE),
    ('Redis',           'redis',           '{}'::text[],                                'dane',     TRUE),
    ('Elasticsearch',   'elasticsearch',   ARRAY['elastic'],                            'dane',     TRUE),
    ('Cassandra',       'cassandra',       '{}'::text[],                                'dane',     TRUE),
    ('Apache Kafka',    'apache-kafka',    ARRAY['kafka'],                              'dane',     TRUE),
    ('RabbitMQ',        'rabbitmq',        ARRAY['rabbit'],                             'dane',     TRUE),
    ('Snowflake',       'snowflake',       '{}'::text[],                                'dane',     TRUE),
    ('Databricks',      'databricks',      '{}'::text[],                                'dane',     TRUE),
    ('Apache Spark',    'apache-spark',    ARRAY['spark', 'pyspark'],                   'dane',     TRUE),
    ('Hadoop',          'hadoop',          '{}'::text[],                                'dane',     TRUE),
    ('Apache Airflow',  'apache-airflow',  ARRAY['airflow'],                            'dane',     TRUE),
    ('dbt',             'dbt',             '{}'::text[],                                'dane',     TRUE),
    ('Power BI',        'power-bi',        ARRAY['powerbi'],                            'dane',     TRUE),
    ('Tableau',         'tableau',         '{}'::text[],                                'dane',     TRUE),
    ('Qlik',            'qlik',            ARRAY['qlikview', 'qlik sense'],             'dane',     TRUE),
    ('SSIS',            'ssis',            '{}'::text[],                                'dane',     TRUE),
    ('Teradata',        'teradata',        '{}'::text[],                                'dane',     TRUE),
    ('ClickHouse',      'clickhouse',      '{}'::text[],                                'dane',     TRUE),
    ('BigQuery',        'bigquery',        '{}'::text[],                                'dane',     TRUE),
    ('DynamoDB',        'dynamodb',        '{}'::text[],                                'dane',     TRUE),
    ('Neo4j',           'neo4j',           '{}'::text[],                                'dane',     TRUE),
    -- DevOps
    ('Kubernetes',      'kubernetes',      ARRAY['k8s', 'kube'],                        'devops',   TRUE),
    ('Docker',          'docker',          '{}'::text[],                                'devops',   TRUE),
    ('Terraform',       'terraform',       ARRAY['tf'],                                 'devops',   TRUE),
    ('Ansible',         'ansible',         '{}'::text[],                                'devops',   TRUE),
    ('Jenkins',         'jenkins',         '{}'::text[],                                'devops',   TRUE),
    ('GitLab',          'gitlab',          ARRAY['gitlab ci'],                          'devops',   TRUE),
    ('GitHub Actions',  'github-actions',  ARRAY['gha'],                                'devops',   TRUE),
    ('Azure DevOps',    'azure-devops',    ARRAY['ado', 'tfs'],                         'devops',   TRUE),
    ('Argo CD',         'argo-cd',         ARRAY['argocd'],                             'devops',   TRUE),
    ('Helm',            'helm',            '{}'::text[],                                'devops',   TRUE),
    ('Prometheus',      'prometheus',      '{}'::text[],                                'devops',   TRUE),
    ('Grafana',         'grafana',         '{}'::text[],                                'devops',   TRUE),
    ('Zabbix',          'zabbix',          '{}'::text[],                                'devops',   TRUE),
    ('Nagios',          'nagios',          '{}'::text[],                                'devops',   TRUE),
    ('SonarQube',       'sonarqube',       ARRAY['sonar'],                              'devops',   TRUE),
    ('Istio',           'istio',           '{}'::text[],                                'devops',   TRUE),
    ('Rancher',         'rancher',         '{}'::text[],                                'devops',   TRUE),
    ('Datadog',         'datadog',         '{}'::text[],                                'devops',   TRUE),
    ('New Relic',       'new-relic',       '{}'::text[],                                'devops',   TRUE),
    ('Splunk',          'splunk',          '{}'::text[],                                'devops',   TRUE),
    ('Bamboo',          'bamboo',          '{}'::text[],                                'devops',   TRUE),
    ('TeamCity',        'teamcity',        '{}'::text[],                                'devops',   TRUE),
    ('Sonatype Nexus',  'sonatype-nexus',  ARRAY['nexus repository'],                   'devops',   TRUE),
    -- Security
    ('Keycloak',        'keycloak',        '{}'::text[],                                'security', TRUE),
    ('OAuth2',          'oauth2',          ARRAY['oauth', 'oidc', 'openid connect'],    'security', TRUE),
    ('Okta',            'okta',            '{}'::text[],                                'security', TRUE),
    ('Active Directory','active-directory',ARRAY['ad'],                                 'security', TRUE),
    ('Entra ID',        'entra-id',        ARRAY['azure ad', 'aad'],                    'security', TRUE),
    ('HashiCorp Vault', 'hashicorp-vault', ARRAY['vault'],                              'security', TRUE),
    ('Burp Suite',      'burp-suite',      ARRAY['burp'],                               'security', TRUE),
    ('Nessus',          'nessus',          '{}'::text[],                                'security', TRUE),
    ('Qualys',          'qualys',          '{}'::text[],                                'security', TRUE),
    ('CrowdStrike',     'crowdstrike',     '{}'::text[],                                'security', TRUE),
    ('Checkmarx',       'checkmarx',       '{}'::text[],                                'security', TRUE),
    ('Snyk',            'snyk',            '{}'::text[],                                'security', TRUE),
    ('Palo Alto',       'palo-alto',       ARRAY['palo alto networks'],                 'security', TRUE),
    ('Fortinet',        'fortinet',        ARRAY['fortigate'],                          'security', TRUE),
    -- Inne (platformy enterprise, integracje, RPA)
    ('SAP',             'sap',             '{}'::text[],                                'inne',     TRUE),
    ('Salesforce',      'salesforce',      ARRAY['sfdc'],                               'inne',     TRUE),
    ('ServiceNow',      'servicenow',      ARRAY['snow'],                               'inne',     TRUE),
    ('SharePoint',      'sharepoint',      '{}'::text[],                                'inne',     TRUE),
    ('Jira',            'jira',            '{}'::text[],                                'inne',     TRUE),
    ('Confluence',      'confluence',      '{}'::text[],                                'inne',     TRUE),
    ('Camunda',         'camunda',         '{}'::text[],                                'inne',     TRUE),
    ('MuleSoft',        'mulesoft',        ARRAY['mule'],                               'inne',     TRUE),
    ('WebSphere',       'websphere',       '{}'::text[],                                'inne',     TRUE),
    ('WebLogic',        'weblogic',        '{}'::text[],                                'inne',     TRUE),
    ('Tomcat',          'tomcat',          '{}'::text[],                                'inne',     TRUE),
    ('Mainframe',       'mainframe',       ARRAY['z/os', 'zos'],                        'inne',     TRUE),
    ('Power Apps',      'power-apps',      ARRAY['powerapps'],                          'inne',     TRUE),
    ('Dynamics 365',    'dynamics-365',    ARRAY['d365'],                               'inne',     TRUE),
    ('UiPath',          'uipath',          '{}'::text[],                                'inne',     TRUE),
    ('Pega',            'pega',            '{}'::text[],                                'inne',     TRUE),
    ('Informatica',     'informatica',     '{}'::text[],                                'inne',     TRUE),
    ('Talend',          'talend',          '{}'::text[],                                'inne',     TRUE),
    ('TIBCO',           'tibco',           '{}'::text[],                                'inne',     TRUE)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
