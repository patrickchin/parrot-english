// Prepare ONLY the caller's disposable local/CI MySQL container for TLS tests.
import { execFileSync } from "node:child_process";
import process from "node:process";
const [container, output] = process.argv.slice(2);
if (!container || !output) throw new Error("Pass the disposable MySQL container and an output CA path.");
const [state] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
if (state.Config.Image !== "mysql:8.0.18" || !state.Config.Env.includes("MYSQL_ROOT_PASSWORD=disposable-test-password")) throw new Error("Refusing to alter a container outside this disposable test configuration.");
execFileSync("docker", ["exec", "--user", "root", container, "sh", "-ec", `
openssl req -new -newkey rsa:2048 -nodes -keyout /tmp/parrot-test-server.key -out /tmp/parrot-test-server.csr -subj /CN=localhost 2>/dev/null
printf 'subjectAltName=DNS:localhost\n' > /tmp/parrot-test-server.ext
openssl x509 -req -days 2 -in /tmp/parrot-test-server.csr -CA /var/lib/mysql/ca.pem -CAkey /var/lib/mysql/ca-key.pem -CAcreateserial -extfile /tmp/parrot-test-server.ext -out /tmp/parrot-test-server.pem 2>/dev/null
cp /tmp/parrot-test-server.key /var/lib/mysql/server-key.pem
cp /tmp/parrot-test-server.pem /var/lib/mysql/server-cert.pem
chown mysql:mysql /var/lib/mysql/server-key.pem /var/lib/mysql/server-cert.pem
chmod 600 /var/lib/mysql/server-key.pem
mysql -uroot -pdisposable-test-password -e 'ALTER INSTANCE RELOAD TLS' 2>/dev/null
`]);
execFileSync("docker", ["cp", `${container}:/var/lib/mysql/ca.pem`, output]);
