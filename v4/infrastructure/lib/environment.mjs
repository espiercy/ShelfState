export const PRIMARY_REGION = "us-west-2";
export const EDGE_CERTIFICATE_REGION = "us-east-1";
export const PROJECT_SLUG = "shelfstate-v4";

const definitions = Object.freeze({
  dev: Object.freeze({
    accountVariable: "SHELFSTATE_DEV_AWS_ACCOUNT_ID",
    environmentName: "dev",
  }),
  prod: Object.freeze({
    accountVariable: "SHELFSTATE_PROD_AWS_ACCOUNT_ID",
    environmentName: "prod",
  }),
});

export const APPROVED_ENVIRONMENTS = Object.freeze(Object.keys(definitions));

function resolveOptionalAccountId(variableName, environment) {
  const value = environment[variableName];
  if (value === undefined) return undefined;

  if (!/^\d{12}$/.test(value)) {
    throw new Error(
      `${variableName} must be an explicit 12-digit AWS account ID when provided.`,
    );
  }

  return value;
}

export function resolveEnvironmentConfig(environmentName, environment = {}) {
  if (typeof environmentName !== "string" || environmentName.length === 0) {
    throw new Error(
      `ShelfState environment is required; expected one of: ${APPROVED_ENVIRONMENTS.join(", ")}.`,
    );
  }

  const definition = definitions[environmentName];
  if (!definition) {
    throw new Error(
      `Unsupported ShelfState environment "${environmentName}"; expected one of: ${APPROVED_ENVIRONMENTS.join(", ")}.`,
    );
  }

  const accountId = resolveOptionalAccountId(
    definition.accountVariable,
    environment,
  );

  return Object.freeze({
    accountId,
    accountSource: definition.accountVariable,
    edgeCertificateRegion: EDGE_CERTIFICATE_REGION,
    environmentName: definition.environmentName,
    namePrefix: `${PROJECT_SLUG}-${definition.environmentName}`,
    primaryRegion: PRIMARY_REGION,
    project: "ShelfState",
  });
}
