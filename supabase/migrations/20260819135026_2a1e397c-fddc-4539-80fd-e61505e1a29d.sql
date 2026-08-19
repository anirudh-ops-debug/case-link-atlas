-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('investigator','senior_investigator','administrator');
CREATE TYPE public.case_status AS ENUM ('Active','Under Review','Escalated','Closed');
CREATE TYPE public.case_priority AS ENUM ('Critical','High','Medium','Low');
CREATE TYPE public.connection_verdict AS ENUM ('pending','confirmed','rejected','inconclusive');

-- ============ AGENCIES / PROFILES / ROLES ============
CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  district text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT 'Unnamed Officer',
  badge_no text,
  unit text,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_verify(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'senior_investigator') OR public.has_role(_user_id,'administrator')
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, badge_no, unit)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,'officer'),'@',1)),
    NEW.raw_user_meta_data->>'badge_no',
    COALESCE(NEW.raw_user_meta_data->>'unit','Central Intelligence Cell')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investigator')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "agencies readable by signed in" ON public.agencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "agencies writable by admins" ON public.agencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "profiles readable by signed in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "roles readable by signed in" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- ============ CASES ============
CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no text NOT NULL UNIQUE,
  fir_number text,
  title text NOT NULL,
  crime_type text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  location_name text,
  latitude double precision,
  longitude double precision,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  investigator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  investigator_name text,
  status public.case_status NOT NULL DEFAULT 'Active',
  priority public.case_priority NOT NULL DEFAULT 'Medium',
  tags text[] NOT NULL DEFAULT '{}',
  modus_operandi text[] NOT NULL DEFAULT '{}',
  notes text,
  is_synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases readable by signed in" ON public.cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "cases writable by signed in" ON public.cases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cases updatable by signed in" ON public.cases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cases deletable by admins" ON public.cases FOR DELETE TO authenticated USING (public.can_verify(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER cases_touch BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ENTITY TABLES ============
CREATE TABLE public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  role_in_case text,
  age integer,
  phone text,
  description text,
  descriptors text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  vehicle_type text,
  make_model text,
  color text,
  plate text,
  plate_partial text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.weapons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  weapon_type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.witnesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name text NOT NULL,
  statement text,
  descriptors text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cctv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner text,
  latitude double precision,
  longitude double precision,
  captured_at timestamptz,
  status text NOT NULL DEFAULT 'Available',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  category text NOT NULL,
  filename text,
  mime_type text,
  description text,
  status text NOT NULL DEFAULT 'Indexed',
  storage_path text,
  latitude double precision,
  longitude double precision,
  collected_at timestamptz,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  title text NOT NULL,
  detail text,
  latitude double precision,
  longitude double precision,
  evidence_id uuid REFERENCES public.evidence(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CONNECTIONS ============
CREATE TABLE public.case_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_a_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_b_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  score numeric(5,2) NOT NULL,
  classification text NOT NULL,
  explanation text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  verdict public.connection_verdict NOT NULL DEFAULT 'pending',
  verdict_reason text,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_by_name text,
  verified_at timestamptz,
  ai_score_at_verdict numeric(5,2),
  CONSTRAINT case_pair_unique UNIQUE (case_a_id, case_b_id),
  CONSTRAINT case_pair_distinct CHECK (case_a_id <> case_b_id)
);
CREATE TABLE public.connection_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.case_connections(id) ON DELETE CASCADE,
  factor text NOT NULL,
  similarity numeric(5,2),
  weight numeric(5,4) NOT NULL,
  insufficient_data boolean NOT NULL DEFAULT false,
  detail text,
  sources text[] NOT NULL DEFAULT '{}'
);

-- ============ BOARDS ============
CREATE TABLE public.investigation_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  cluster_key text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.investigation_boards(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_id uuid,
  label text NOT NULL,
  note text,
  x numeric(6,2) NOT NULL DEFAULT 50,
  y numeric(6,2) NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.board_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.investigation_boards(id) ON DELETE CASCADE,
  from_item_id uuid NOT NULL REFERENCES public.board_items(id) ON DELETE CASCADE,
  to_item_id uuid NOT NULL REFERENCES public.board_items(id) ON DELETE CASCADE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ALERTS / AUDIT ============
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.case_connections(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT 'system',
  action_type text NOT NULL,
  action text NOT NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GRANTS + RLS for the rest ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['persons','vehicles','weapons','locations','witnesses','cctv','evidence','timeline_events','case_connections','connection_factors','investigation_boards','board_items','board_connections','alerts','audit_logs']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['persons','vehicles','weapons','locations','witnesses','cctv','evidence','timeline_events','connection_factors','investigation_boards','board_items','board_connections','alerts']
  LOOP
    EXECUTE format('CREATE POLICY "%1$s readable by signed in" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "%1$s writable by signed in" ON public.%1$I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

CREATE POLICY "connections readable by signed in" ON public.case_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY "connections insertable by signed in" ON public.case_connections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "connections updatable by verifiers" ON public.case_connections FOR UPDATE TO authenticated
  USING (public.can_verify(auth.uid())) WITH CHECK (public.can_verify(auth.uid()));
CREATE POLICY "connections deletable by verifiers" ON public.case_connections FOR DELETE TO authenticated
  USING (public.can_verify(auth.uid()));

CREATE POLICY "audit insertable by signed in" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "audit readable by verifiers" ON public.audit_logs FOR SELECT TO authenticated USING (public.can_verify(auth.uid()));

CREATE INDEX idx_cases_crime_type ON public.cases(crime_type);
CREATE INDEX idx_cases_occurred_at ON public.cases(occurred_at);
CREATE INDEX idx_evidence_case ON public.evidence(case_id);
CREATE INDEX idx_timeline_case ON public.timeline_events(case_id);
CREATE INDEX idx_conn_a ON public.case_connections(case_a_id);
CREATE INDEX idx_conn_b ON public.case_connections(case_b_id);

-- ============ SYNTHETIC DEMO CORPUS (fictional) ============
INSERT INTO public.agencies (id, name, district) VALUES
 ('a0000000-0000-4000-8000-000000000001','Chennai City Police — Central Intelligence Cell','Chennai Central'),
 ('a0000000-0000-4000-8000-000000000002','Chennai City Police — South Zone','Chennai South');

INSERT INTO public.cases (id, case_no, fir_number, title, crime_type, description, occurred_at, location_name, latitude, longitude, agency_id, investigator_name, status, priority, tags, modus_operandi, notes) VALUES
 ('c0000000-0000-4000-8000-000000000001','CASE-1042','FIR/2026/CEN/1042','Missing person — Priya Anand (synthetic)','Missing Person','SYNTHETIC DEMO RECORD. 24-year-old last seen leaving a workplace in Adyar; phone last pinged near Kotturpuram bridge.','2026-07-14 21:10:00+05:30','Adyar Depot, Chennai',13.0067,80.2570,'a0000000-0000-4000-8000-000000000002','Insp. A. Vetrivel','Active','Critical','{missing,night,transport-hub}','{"left workplace alone","last seen boarding shared auto","phone switched off within 40 minutes"}','Family reports no prior disappearance.'),
 ('c0000000-0000-4000-8000-000000000002','CASE-7781','FIR/2026/SOU/7781','Residential burglary — Velachery (synthetic)','Burglary','SYNTHETIC DEMO RECORD. Ground-floor flat entered through rear kitchen window while occupants away; CCTV at gate found disconnected.','2026-07-16 01:35:00+05:30','Velachery 100ft Road, Chennai',12.9750,80.2210,'a0000000-0000-4000-8000-000000000002','SI R. Mahalakshmi','Active','High','{burglary,night,cctv-tampering}','{"rear window entry","glass cut with tape","cctv cable disconnected","operates between 0100 and 0300"}','Gold ornaments and cash reported missing.'),
 ('c0000000-0000-4000-8000-000000000003','CASE-8123','FIR/2026/SOU/8123','Residential burglary — Guindy (synthetic)','Burglary','SYNTHETIC DEMO RECORD. Rear window entry, tape used on glass, gate camera cable cut. White panel van seen leaving the lane.','2026-07-23 02:05:00+05:30','Guindy Industrial Estate Road, Chennai',13.0067,80.2120,'a0000000-0000-4000-8000-000000000002','SI R. Mahalakshmi','Under Review','High','{burglary,night,cctv-tampering,vehicle}','{"rear window entry","glass cut with tape","cctv cable disconnected","operates between 0100 and 0300"}','Neighbour recorded partial registration of a white van.'),
 ('c0000000-0000-4000-8000-000000000004','CASE-4410','FIR/2026/CEN/4410','Chain snatching — T. Nagar (synthetic)','Theft','SYNTHETIC DEMO RECORD. Two riders on a dark motorcycle snatched a chain near a market lane during evening rush.','2026-07-18 19:20:00+05:30','Ranganathan Street area, T. Nagar',13.0400,80.2330,'a0000000-0000-4000-8000-000000000001','Insp. K. Sundar','Active','Medium','{snatching,two-wheeler,evening}','{"pillion rider snatches","approach from behind","market crowd cover"}','Victim unhurt.'),
 ('c0000000-0000-4000-8000-000000000005','CASE-4478','FIR/2026/CEN/4478','Chain snatching — Saidapet (synthetic)','Theft','SYNTHETIC DEMO RECORD. Similar snatching by two riders on a dark motorcycle near a bus stop in the evening.','2026-07-21 19:45:00+05:30','Saidapet Bus Terminus, Chennai',13.0210,80.2240,'a0000000-0000-4000-8000-000000000001','Insp. K. Sundar','Active','Medium','{snatching,two-wheeler,evening}','{"pillion rider snatches","approach from behind","bus stop crowd cover"}','Registration not noted by witnesses.'),
 ('c0000000-0000-4000-8000-000000000006','CASE-9002','FIR/2026/SOU/9002','Vehicle theft — Perungudi (synthetic)','Vehicle Crime','SYNTHETIC DEMO RECORD. White panel van reported stolen from a service lane; later linked to sightings in two burglary lanes.','2026-07-20 03:15:00+05:30','Perungudi Service Lane, Chennai',12.9640,80.2450,'a0000000-0000-4000-8000-000000000002','SI D. Karthik','Active','High','{vehicle,night}','{"lock picked","taken between 0300 and 0400"}','Owner reports no prior incident.');

INSERT INTO public.persons (case_id, full_name, aliases, role_in_case, age, phone, description, descriptors) VALUES
 ('c0000000-0000-4000-8000-000000000001','Priya Anand','{Priya A.}','Missing person',24,'+91 90000 11111','Last seen wearing a dark green kurta.','{"green kurta","shoulder bag"}'),
 ('c0000000-0000-4000-8000-000000000002','Unknown male','{}','Suspect',NULL,NULL,'Slim build, dark full-sleeve shirt, face covered.','{"slim build","dark full sleeve","face covered"}'),
 ('c0000000-0000-4000-8000-000000000003','Unknown male','{}','Suspect',NULL,NULL,'Slim build, dark full-sleeve shirt, cloth over face.','{"slim build","dark full sleeve","face covered"}'),
 ('c0000000-0000-4000-8000-000000000004','Unknown riders','{}','Suspect',NULL,NULL,'Two riders, helmets, pillion snatches.','{"two riders","helmet","dark jacket"}'),
 ('c0000000-0000-4000-8000-000000000005','Unknown riders','{}','Suspect',NULL,NULL,'Two riders, helmets, dark jacket.','{"two riders","helmet","dark jacket"}');

INSERT INTO public.vehicles (case_id, vehicle_type, make_model, color, plate, plate_partial, notes) VALUES
 ('c0000000-0000-4000-8000-000000000002','Van','Panel van','White',NULL,'TN 09 * 47','Seen idling at the lane mouth.'),
 ('c0000000-0000-4000-8000-000000000003','Van','Panel van','White',NULL,'TN 09 BQ 47','Partial registration recorded by neighbour.'),
 ('c0000000-0000-4000-8000-000000000006','Van','Panel van','White','TN 09 BQ 4712','TN 09 BQ 47','Reported stolen; matches burglary lane sightings.'),
 ('c0000000-0000-4000-8000-000000000004','Motorcycle','Commuter motorcycle','Dark grey',NULL,NULL,'No plate visible in CCTV.'),
 ('c0000000-0000-4000-8000-000000000005','Motorcycle','Commuter motorcycle','Dark grey',NULL,'TN 22 * 09','Partial only.'),
 ('c0000000-0000-4000-8000-000000000001','Auto rickshaw','Shared auto','Yellow-black',NULL,NULL,'Last seen boarding.');

INSERT INTO public.weapons (case_id, weapon_type, description) VALUES
 ('c0000000-0000-4000-8000-000000000002','Cutting tool','Glass cutter with adhesive tape residue.'),
 ('c0000000-0000-4000-8000-000000000003','Cutting tool','Glass cutter with adhesive tape residue.');

INSERT INTO public.locations (case_id, name, kind, latitude, longitude) VALUES
 ('c0000000-0000-4000-8000-000000000001','Adyar Depot','Last seen',13.0067,80.2570),
 ('c0000000-0000-4000-8000-000000000001','Kotturpuram Bridge','Last phone ping',13.0170,80.2450),
 ('c0000000-0000-4000-8000-000000000002','Velachery 100ft Road','Crime scene',12.9750,80.2210),
 ('c0000000-0000-4000-8000-000000000003','Guindy Estate Road','Crime scene',13.0067,80.2120),
 ('c0000000-0000-4000-8000-000000000004','T. Nagar market lane','Crime scene',13.0400,80.2330),
 ('c0000000-0000-4000-8000-000000000005','Saidapet Bus Terminus','Crime scene',13.0210,80.2240),
 ('c0000000-0000-4000-8000-000000000006','Perungudi Service Lane','Crime scene',12.9640,80.2450);

INSERT INTO public.witnesses (case_id, name, statement, descriptors) VALUES
 ('c0000000-0000-4000-8000-000000000002','Ravi (neighbour)','Heard a van idling around 1:30 am and saw a slim man in a dark full-sleeve shirt near the rear wall.','{"slim build","dark full sleeve","white van","face covered"}'),
 ('c0000000-0000-4000-8000-000000000003','Meena (shopkeeper)','A white panel van left the lane at about 2:15 am; one man in a dark full-sleeve shirt boarded.','{"slim build","dark full sleeve","white van","face covered"}'),
 ('c0000000-0000-4000-8000-000000000004','Suresh (vendor)','Two helmeted riders on a dark motorcycle; pillion grabbed the chain.','{"two riders","helmet","dark motorcycle"}'),
 ('c0000000-0000-4000-8000-000000000005','Latha (commuter)','Dark motorcycle with two riders, pillion snatched and they escaped toward the bridge.','{"two riders","helmet","dark motorcycle"}'),
 ('c0000000-0000-4000-8000-000000000001','Auto stand attendant','She boarded a shared auto heading towards Kotturpuram.','{"green kurta","shoulder bag"}');

INSERT INTO public.cctv (case_id, name, owner, latitude, longitude, captured_at, status, notes) VALUES
 ('c0000000-0000-4000-8000-000000000001','Depot gate camera','Transport corporation',13.0069,80.2572,'2026-07-14 21:08:00+05:30','Available','Subject visible walking south.'),
 ('c0000000-0000-4000-8000-000000000002','Apartment gate camera','Residents association',12.9752,80.2212,'2026-07-16 01:28:00+05:30','Tampered','Cable found disconnected before the incident.'),
 ('c0000000-0000-4000-8000-000000000003','Lane shop camera','Private shop',13.0065,80.2118,'2026-07-23 02:12:00+05:30','Partial','White van rear visible, registration unreadable.'),
 ('c0000000-0000-4000-8000-000000000004','Market junction camera','Corporation',13.0402,80.2332,'2026-07-18 19:22:00+05:30','Available','Motorcycle passes twice before incident.'),
 ('c0000000-0000-4000-8000-000000000005','Terminus camera','Transport corporation',13.0212,80.2242,'2026-07-21 19:47:00+05:30','Available','Similar motorcycle circling.'),
 ('c0000000-0000-4000-8000-000000000006','Service lane camera','Private',12.9642,80.2452,'2026-07-20 03:10:00+05:30','Unavailable','Recording overwritten.');

INSERT INTO public.evidence (case_id, category, filename, mime_type, description, status, uploaded_by_name, collected_at, latitude, longitude) VALUES
 ('c0000000-0000-4000-8000-000000000001','FIR','fir-1042.pdf','application/pdf','First information report (synthetic).','Indexed','Insp. A. Vetrivel','2026-07-15 08:00:00+05:30',13.0067,80.2570),
 ('c0000000-0000-4000-8000-000000000001','CCTV','depot-gate-2110.mp4','video/mp4','Depot gate footage clip (synthetic).','Indexed','Insp. A. Vetrivel','2026-07-15 10:20:00+05:30',13.0069,80.2572),
 ('c0000000-0000-4000-8000-000000000002','Crime Scene Photo','velachery-window.jpg','image/jpeg','Rear window with tape residue (synthetic).','Indexed','SI R. Mahalakshmi','2026-07-16 07:40:00+05:30',12.9750,80.2210),
 ('c0000000-0000-4000-8000-000000000002','Witness Statement','stmt-ravi.pdf','application/pdf','Neighbour statement (synthetic).','Indexed','SI R. Mahalakshmi','2026-07-16 12:00:00+05:30',12.9750,80.2210),
 ('c0000000-0000-4000-8000-000000000003','Crime Scene Photo','guindy-window.jpg','image/jpeg','Rear window with identical tape pattern (synthetic).','Indexed','SI R. Mahalakshmi','2026-07-23 08:10:00+05:30',13.0067,80.2120),
 ('c0000000-0000-4000-8000-000000000003','CCTV','guindy-lane-0212.mp4','video/mp4','White van leaving lane (synthetic).','Indexed','SI R. Mahalakshmi','2026-07-23 11:00:00+05:30',13.0065,80.2118),
 ('c0000000-0000-4000-8000-000000000004','CCTV','tnagar-junction.mp4','video/mp4','Motorcycle pass-by clip (synthetic).','Indexed','Insp. K. Sundar','2026-07-18 21:00:00+05:30',13.0402,80.2332),
 ('c0000000-0000-4000-8000-000000000005','CCTV','saidapet-terminus.mp4','video/mp4','Motorcycle circling clip (synthetic).','Indexed','Insp. K. Sundar','2026-07-21 21:10:00+05:30',13.0212,80.2242),
 ('c0000000-0000-4000-8000-000000000006','Vehicle','van-theft-report.pdf','application/pdf','Vehicle theft report for white panel van (synthetic).','Indexed','SI D. Karthik','2026-07-20 09:00:00+05:30',12.9640,80.2450);

INSERT INTO public.timeline_events (case_id, kind, occurred_at, title, detail, latitude, longitude) VALUES
 ('c0000000-0000-4000-8000-000000000001','Crime occurrence','2026-07-14 21:10:00+05:30','Last seen at Adyar depot','Subject seen walking south alone.',13.0067,80.2570),
 ('c0000000-0000-4000-8000-000000000001','CCTV event','2026-07-14 21:08:00+05:30','Depot gate camera capture','Subject visible on gate camera.',13.0069,80.2572),
 ('c0000000-0000-4000-8000-000000000001','Vehicle sighting','2026-07-14 21:25:00+05:30','Boarded shared auto','Auto stand attendant statement.',13.0080,80.2540),
 ('c0000000-0000-4000-8000-000000000001','FIR filing','2026-07-15 08:00:00+05:30','FIR registered','FIR/2026/CEN/1042.',NULL,NULL),
 ('c0000000-0000-4000-8000-000000000002','CCTV event','2026-07-16 01:28:00+05:30','Gate camera cable disconnected','Camera stops recording.',12.9752,80.2212),
 ('c0000000-0000-4000-8000-000000000002','Crime occurrence','2026-07-16 01:35:00+05:30','Entry through rear window','Glass cut with tape.',12.9750,80.2210),
 ('c0000000-0000-4000-8000-000000000002','Witness report','2026-07-16 09:00:00+05:30','Neighbour reports idling van','White panel van at lane mouth.',12.9750,80.2210),
 ('c0000000-0000-4000-8000-000000000003','Crime occurrence','2026-07-23 02:05:00+05:30','Entry through rear window','Identical tape pattern to CASE-7781.',13.0067,80.2120),
 ('c0000000-0000-4000-8000-000000000003','Vehicle sighting','2026-07-23 02:15:00+05:30','White van leaves lane','Partial registration TN 09 BQ 47.',13.0065,80.2118),
 ('c0000000-0000-4000-8000-000000000004','Crime occurrence','2026-07-18 19:20:00+05:30','Chain snatched in market lane','Pillion rider snatch.',13.0400,80.2330),
 ('c0000000-0000-4000-8000-000000000005','Crime occurrence','2026-07-21 19:45:00+05:30','Chain snatched near terminus','Pillion rider snatch.',13.0210,80.2240),
 ('c0000000-0000-4000-8000-000000000006','Crime occurrence','2026-07-20 03:15:00+05:30','White panel van stolen','Lock picked in service lane.',12.9640,80.2450);

INSERT INTO public.alerts (kind, title, body, case_id) VALUES
 ('evidence','Evidence uploaded','Synthetic corpus loaded for CASE-8123.','c0000000-0000-4000-8000-000000000003'),
 ('system','Synthetic corpus initialised','All records in this deployment are fictional demonstration data.',NULL);

INSERT INTO public.audit_logs (actor_name, action_type, action, case_id, detail) VALUES
 ('system','seed','Synthetic corpus initialised',NULL,'Six fictional cases with entities, evidence, CCTV and timelines.');