-- Co-host por home game: adiciona MemberRole enum e role em HomeGameMember.
-- PLAYER = membro comum, HOST = co-host (pode gerenciar o home game junto com o dono).
-- O dono original continua imutavel via HomeGame.hostId.

CREATE TYPE "MemberRole" AS ENUM ('PLAYER', 'HOST');

ALTER TABLE "HomeGameMember"
ADD COLUMN "role" "MemberRole" NOT NULL DEFAULT 'PLAYER';
