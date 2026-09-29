export const HUMAN_ACCESS_POLICY_MODEL_VERSION = "wp-005c1-v1";
export const HUMAN_ACCESS_SESSION_DURATION = "PT1H";
export const RECOVERY_ACTIVATION_WORK_PACKAGE = "WP-039";

export const HUMAN_ACCESS_ASSIGNMENTS = Object.freeze([
  Object.freeze({
    group: "ShelfStateAccountAdmins",
    permissionSet: "ShelfStateAccountAdmin",
    principal: "PrimaryHumanPrincipal",
  }),
  Object.freeze({
    group: "ShelfStateOperators",
    permissionSet: "ShelfStateOperator",
    principal: "PrimaryHumanPrincipal",
  }),
  Object.freeze({
    group: "ShelfStateRecovery",
    permissionSet: "ShelfStateRecovery",
    principal: "RecoveryHumanPrincipal",
  }),
]);

export const PROHIBITED_API_CAPABILITY_AUTHORIZATION = Object.freeze({
  "dynamodb:BatchExecuteStatement": Object.freeze([
    "dynamodb:PartiQLSelect",
    "dynamodb:PartiQLInsert",
    "dynamodb:PartiQLUpdate",
    "dynamodb:PartiQLDelete",
  ]),
  "dynamodb:ExecuteStatement": Object.freeze([
    "dynamodb:PartiQLSelect",
    "dynamodb:PartiQLInsert",
    "dynamodb:PartiQLUpdate",
    "dynamodb:PartiQLDelete",
  ]),
  "dynamodb:ExecuteTransaction": Object.freeze([
    "dynamodb:PartiQLSelect",
    "dynamodb:PartiQLInsert",
    "dynamodb:PartiQLUpdate",
    "dynamodb:PartiQLDelete",
  ]),
  "dynamodb:TransactGetItems": Object.freeze(["dynamodb:GetItem"]),
  "s3:SelectObjectContent": Object.freeze(["s3:GetObject"]),
});

export const CONTENT_ACCESS_ACTIONS = Object.freeze([
  "dynamodb:GetItem",
  "dynamodb:BatchGetItem",
  "dynamodb:Query",
  "dynamodb:Scan",
  "dynamodb:PartiQLSelect",
  "dynamodb:PartiQLInsert",
  "dynamodb:PartiQLUpdate",
  "dynamodb:PartiQLDelete",
  "dynamodb:ExportTableToPointInTime",
  "s3:ListBucket",
  "s3:ListBucketVersions",
  "s3:ListBucketMultipartUploads",
  "s3:GetObject*",
  "s3:GetObjectAttributes",
  "s3:RestoreObject",
  "cognito-idp:ListUsers",
  "cognito-idp:ListUsersInGroup",
  "cognito-idp:AdminGetUser",
  "cognito-idp:AdminListGroupsForUser",
  "lambda:InvokeFunction",
  "lambda:InvokeAsync",
  "lambda:InvokeFunctionUrl",
  "execute-api:Invoke",
  "secretsmanager:GetSecretValue",
  "secretsmanager:BatchGetSecretValue",
  "ssm:GetParameter",
  "ssm:GetParameters",
  "ssm:GetParametersByPath",
  "kms:Decrypt",
  "kms:ReEncryptFrom",
  "kms:GenerateDataKey",
  "kms:GenerateDataKeyWithoutPlaintext",
]);

const ROLE_ASSUMPTION_ACTIONS = Object.freeze([
  "iam:PassRole",
  "sts:AssumeRole",
]);

const RECOVERY_ACTIONS = Object.freeze([
  "backup:StartRestoreJob",
  "backup:StartBackupJob",
  "backup:StartCopyJob",
  "backup:DeleteBackupPlan",
  "backup:DeleteBackupSelection",
  "backup:DeleteBackupVault",
  "backup:DeleteBackupVaultAccessPolicy",
  "backup:DeleteBackupVaultLockConfiguration",
  "backup:DeleteRecoveryPoint",
  "backup:PutBackupVaultAccessPolicy",
  "backup:PutBackupVaultLockConfiguration",
  "backup:UpdateBackupPlan",
  "backup:UpdateGlobalSettings",
  "backup:UpdateRecoveryPointLifecycle",
]);

const APPLICATION_MUTATION_ACTIONS = Object.freeze([
  "cloudformation:CancelUpdateStack",
  "cloudformation:ContinueUpdateRollback",
  "cloudformation:CreateChangeSet",
  "cloudformation:CreateStack",
  "cloudformation:DeleteChangeSet",
  "cloudformation:DeleteStack",
  "cloudformation:ExecuteChangeSet",
  "cloudformation:ImportStacksToStackSet",
  "cloudformation:RollbackStack",
  "cloudformation:SetStackPolicy",
  "cloudformation:UpdateStack",
  "cloudformation:UpdateStackSet",
]);

const IAM_INVENTORY_ACTIONS = Object.freeze([
  "iam:GenerateCredentialReport",
  "iam:GetAccountAuthorizationDetails",
  "iam:GetAccountPasswordPolicy",
  "iam:GetAccountSummary",
  "iam:GetContextKeysForCustomPolicy",
  "iam:GetContextKeysForPrincipalPolicy",
  "iam:GetCredentialReport",
  "iam:GetPolicy",
  "iam:GetPolicyVersion",
  "iam:GetRole",
  "iam:GetRolePolicy",
  "iam:GetUser",
  "iam:GetUserPolicy",
  "iam:ListAccessKeys",
  "iam:ListAccountAliases",
  "iam:ListAttachedGroupPolicies",
  "iam:ListAttachedRolePolicies",
  "iam:ListAttachedUserPolicies",
  "iam:ListEntitiesForPolicy",
  "iam:ListGroups",
  "iam:ListGroupsForUser",
  "iam:ListInstanceProfilesForRole",
  "iam:ListMFADevices",
  // OIDC-provider listing has no resource-scoped authorization type.
  "iam:ListOpenIDConnectProviders",
  "iam:ListPolicies",
  "iam:ListPolicyTags",
  "iam:ListPolicyVersions",
  "iam:ListRolePolicies",
  "iam:ListRoles",
  "iam:ListRoleTags",
  "iam:ListUserPolicies",
  "iam:ListUsers",
  "iam:ListUserTags",
  "iam:ListVirtualMFADevices",
  "iam:SimulateCustomPolicy",
  "iam:SimulatePrincipalPolicy",
]);

const SHELFSTATE_IAM_ADMIN_ACTIONS = Object.freeze([
  "iam:AttachRolePolicy",
  "iam:CreatePolicy",
  "iam:CreatePolicyVersion",
  "iam:CreateRole",
  "iam:DeletePolicy",
  "iam:DeletePolicyVersion",
  "iam:DeleteRole",
  "iam:DeleteRolePolicy",
  "iam:DetachRolePolicy",
  "iam:PutRolePolicy",
  "iam:SetDefaultPolicyVersion",
  "iam:TagPolicy",
  "iam:TagRole",
  "iam:UntagPolicy",
  "iam:UntagRole",
  "iam:UpdateAssumeRolePolicy",
  "iam:UpdateRole",
  "iam:UpdateRoleDescription",
]);

const IDENTITY_CENTER_GLOBAL_READ_ACTIONS = Object.freeze([
  "sso:ListInstances",
]);

const IDENTITY_CENTER_INSTANCE_ACTIONS = Object.freeze([
  "sso:DescribeAccountAssignmentCreationStatus",
  "sso:DescribeAccountAssignmentDeletionStatus",
  "sso:DescribeInstance",
  "sso:DescribePermissionSetProvisioningStatus",
  "sso:ListAccountAssignmentCreationStatus",
  "sso:ListAccountAssignmentDeletionStatus",
  "sso:ListPermissionSets",
]);

const IDENTITY_CENTER_PERMISSION_SET_ACTIONS = Object.freeze([
  "sso:DeleteInlinePolicyFromPermissionSet",
  "sso:DescribePermissionSet",
  "sso:GetInlinePolicyForPermissionSet",
  "sso:ListAccountsForProvisionedPermissionSet",
  "sso:PutInlinePolicyToPermissionSet",
  "sso:UpdatePermissionSet",
]);

const IDENTITY_CENTER_ASSIGNMENT_ACTIONS = Object.freeze([
  "sso:CreateAccountAssignment",
  "sso:DeleteAccountAssignment",
  "sso:ListAccountAssignments",
  "sso:ListPermissionSetsProvisionedToAccount",
  "sso:ProvisionPermissionSet",
]);

const IDENTITY_STORE_DIRECTORY_READ_ACTIONS = Object.freeze([
  "identitystore:ListGroups",
  "identitystore:ListUsers",
]);

const IDENTITY_STORE_GROUP_ACTIONS = Object.freeze([
  "identitystore:DescribeGroup",
  "identitystore:GetGroupId",
  "identitystore:UpdateGroup",
]);

const IDENTITY_STORE_USER_READ_ACTIONS = Object.freeze([
  "identitystore:DescribeUser",
  "identitystore:GetUserId",
]);

const IDENTITY_STORE_MEMBERSHIP_ACTIONS = Object.freeze([
  "identitystore:CreateGroupMembership",
  "identitystore:DeleteGroupMembership",
  "identitystore:DescribeGroupMembership",
  "identitystore:GetGroupMembershipId",
  "identitystore:IsMemberInGroups",
  "identitystore:ListGroupMemberships",
  "identitystore:ListGroupMembershipsForMember",
]);

const ACCOUNT_AUDIT_ACTIONS = Object.freeze([
  "access-analyzer:ValidatePolicy",
  "account:GetAlternateContact",
  "account:GetContactInformation",
  "account:GetPrimaryEmail",
  "account:ListRegions",
  "cloudtrail:DescribeTrails",
  "cloudtrail:GetTrail",
  "cloudtrail:GetTrailStatus",
  "cloudtrail:ListEventDataStores",
  "cloudtrail:ListTrails",
  "cloudtrail:LookupEvents",
  "organizations:DescribeAccount",
  "organizations:DescribeOrganization",
  "organizations:ListAWSServiceAccessForOrganization",
  "organizations:ListAccounts",
  "organizations:ListDelegatedAdministrators",
]);

const OPERATOR_METADATA_ACTIONS = Object.freeze([
  "cloudtrail:LookupEvents",
  "cloudwatch:DescribeAlarmHistory",
  "cloudwatch:DescribeAlarms",
  "cloudwatch:ListMetrics",
]);

export const ALLOWED_WILDCARD_RESOURCE_ACTIONS = Object.freeze([
  ...IAM_INVENTORY_ACTIONS,
  ...IDENTITY_CENTER_GLOBAL_READ_ACTIONS,
  ...ACCOUNT_AUDIT_ACTIONS,
  ...OPERATOR_METADATA_ACTIONS,
]);

function requireMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} is not a valid runtime binding`);
  }
  return value;
}

function requireNamedBindings(bindings, names, label, pattern) {
  if (!bindings || typeof bindings !== "object") {
    throw new TypeError(`${label} bindings are required`);
  }
  return names.map((name) =>
    requireMatch(bindings[name], pattern, `${label}.${name}`),
  );
}

function policyStatement(sid, effect, action, resource) {
  return Object.freeze({
    Action: Object.freeze([...action]),
    Effect: effect,
    Resource: Array.isArray(resource)
      ? Object.freeze([...resource])
      : resource,
    Sid: sid,
  });
}

function policyDocument(statements) {
  return Object.freeze({
    Statement: Object.freeze(statements),
    Version: "2012-10-17",
  });
}

const COMMON_DENY_STATEMENTS = Object.freeze([
  policyStatement("DenyApplicationContent", "Deny", CONTENT_ACCESS_ACTIONS, "*"),
  policyStatement("DenyUnrestrictedRoleUse", "Deny", ROLE_ASSUMPTION_ACTIONS, "*"),
]);

function permissionSet(name, inlinePolicy, deferredCapabilities) {
  return Object.freeze({
    deferredCapabilities: Object.freeze(deferredCapabilities),
    inlinePolicy,
    managedPolicies: Object.freeze([]),
    name,
    sessionDuration: HUMAN_ACCESS_SESSION_DURATION,
  });
}

function materializedResources(bindings) {
  const accountId = requireMatch(bindings?.accountId, /^\d{12}$/, "accountId");
  const instanceArn = requireMatch(
    bindings?.identityCenterInstanceArn,
    /^arn:aws:sso:::instance\/(sso)?ins-[A-Za-z0-9.-]{16}$/,
    "identityCenterInstanceArn",
  );
  const identityStoreId = requireMatch(
    bindings?.identityStoreId,
    /^d-[0-9a-f]{10}$/,
    "identityStoreId",
  );
  const instanceId = instanceArn.slice(instanceArn.lastIndexOf("/") + 1);
  const permissionSetNames = HUMAN_ACCESS_ASSIGNMENTS.map(
    ({ permissionSet: name }) => name,
  );
  const groupNames = HUMAN_ACCESS_ASSIGNMENTS.map(({ group }) => group);
  const principalNames = [...new Set(HUMAN_ACCESS_ASSIGNMENTS.map(({ principal }) => principal))];
  const opaqueIdentityId = /^(?:[0-9a-f]{10}-)?[0-9a-f-]{16,47}$/i;
  const groupIds = requireNamedBindings(
    bindings?.groupIds,
    groupNames,
    "groupIds",
    opaqueIdentityId,
  );
  const principalIds = requireNamedBindings(
    bindings?.principalIds,
    principalNames,
    "principalIds",
    opaqueIdentityId,
  );
  const escapedInstanceId = instanceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const permissionSetArns = requireNamedBindings(
    bindings?.permissionSetArns,
    permissionSetNames,
    "permissionSetArns",
    new RegExp(
      `^arn:aws:sso:::permissionSet/${escapedInstanceId}/ps-[A-Za-z0-9-./]{16}$`,
    ),
  );

  return Object.freeze({
    allGroupMembershipsArn: "arn:aws:identitystore:::membership/*",
    allGroupsArn: "arn:aws:identitystore:::group/*",
    allUsersArn: "arn:aws:identitystore:::user/*",
    groupArns: Object.freeze(
      groupIds.map((groupId) => `arn:aws:identitystore:::group/${groupId}`),
    ),
    identityCenterAccountArn: `arn:aws:sso:::account/${accountId}`,
    githubOidcProviderArn: `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
    // AG-001C: management-account Identity Center self-reprovisioning only.
    // The suffix is service-owned; the account and permission-set namespace are not.
    accountAdminGeneratedRoleArn: `arn:aws:iam::${accountId}:role/aws-reserved/sso.amazonaws.com/us-west-2/AWSReservedSSO_ShelfStateAccountAdmin_*`,
    identityStoreArn: `arn:aws:identitystore::${accountId}:identitystore/${identityStoreId}`,
    instanceArn,
    permissionSetArns: Object.freeze(permissionSetArns),
    principalArns: Object.freeze(
      principalIds.map((principalId) => `arn:aws:identitystore:::user/${principalId}`),
    ),
    shelfStateIamArns: Object.freeze([
      `arn:aws:iam::${accountId}:policy/ShelfState*`,
      `arn:aws:iam::${accountId}:role/ShelfState*`,
    ]),
  });
}

export function createHumanAccessPermissionSets(bindings) {
  const resources = materializedResources(bindings);

  const accountAdminPolicy = policyDocument([
    policyStatement("AllowIamInventory", "Allow", IAM_INVENTORY_ACTIONS, "*"),
    policyStatement(
      "AllowGitHubOidcProviderRead",
      "Allow",
      ["iam:GetOpenIDConnectProvider"],
      resources.githubOidcProviderArn,
    ),
    policyStatement(
      "AllowShelfStateRolePolicyAdministration",
      "Allow",
      SHELFSTATE_IAM_ADMIN_ACTIONS,
      resources.shelfStateIamArns,
    ),
    policyStatement(
      "AllowAccountAdminGeneratedRoleInlinePolicyProvisioning",
      "Allow",
      ["iam:PutRolePolicy"],
      resources.accountAdminGeneratedRoleArn,
    ),
    policyStatement(
      "AllowIdentityCenterDiscovery",
      "Allow",
      IDENTITY_CENTER_GLOBAL_READ_ACTIONS,
      "*",
    ),
    policyStatement(
      "AllowIdentityCenterInstanceAdministration",
      "Allow",
      IDENTITY_CENTER_INSTANCE_ACTIONS,
      resources.instanceArn,
    ),
    policyStatement(
      "AllowShelfStatePermissionSetAdministration",
      "Allow",
      IDENTITY_CENTER_PERMISSION_SET_ACTIONS,
      [resources.instanceArn, ...resources.permissionSetArns],
    ),
    policyStatement(
      "AllowShelfStateAccountAssignments",
      "Allow",
      IDENTITY_CENTER_ASSIGNMENT_ACTIONS,
      [
        resources.identityCenterAccountArn,
        resources.instanceArn,
        ...resources.permissionSetArns,
      ],
    ),
    policyStatement(
      "AllowIdentityStoreDirectoryRead",
      "Allow",
      IDENTITY_STORE_DIRECTORY_READ_ACTIONS,
      [resources.identityStoreArn, resources.allGroupsArn, resources.allUsersArn],
    ),
    policyStatement(
      "AllowShelfStateGroupAdministration",
      "Allow",
      IDENTITY_STORE_GROUP_ACTIONS,
      [resources.identityStoreArn, ...resources.groupArns],
    ),
    policyStatement(
      "AllowSelectedIdentityRead",
      "Allow",
      IDENTITY_STORE_USER_READ_ACTIONS,
      [resources.identityStoreArn, ...resources.principalArns],
    ),
    policyStatement(
      "AllowShelfStateMembershipAdministration",
      "Allow",
      IDENTITY_STORE_MEMBERSHIP_ACTIONS,
      [
        resources.identityStoreArn,
        resources.allGroupMembershipsArn,
        ...resources.groupArns,
        ...resources.principalArns,
      ],
    ),
    policyStatement("AllowAccountAuditInventory", "Allow", ACCOUNT_AUDIT_ACTIONS, "*"),
    ...COMMON_DENY_STATEMENTS,
    policyStatement("DenyRecoveryAuthority", "Deny", RECOVERY_ACTIONS, "*"),
    policyStatement(
      "DenyApplicationDeployment",
      "Deny",
      APPLICATION_MUTATION_ACTIONS,
      "*",
    ),
  ]);

  const operatorPolicy = policyDocument([
    policyStatement(
      "AllowCurrentAccountOperationalMetadata",
      "Allow",
      OPERATOR_METADATA_ACTIONS,
      "*",
    ),
    ...COMMON_DENY_STATEMENTS,
    policyStatement(
      "DenyIdentityAdministration",
      "Deny",
      ["account:*", "iam:*", "identitystore:*", "organizations:*", "sso:*"],
      "*",
    ),
    policyStatement("DenyRecoveryAuthority", "Deny", RECOVERY_ACTIONS, "*"),
    policyStatement(
      "DenyApplicationDeployment",
      "Deny",
      APPLICATION_MUTATION_ACTIONS,
      "*",
    ),
  ]);

  const recoveryPolicy = policyDocument([
    ...COMMON_DENY_STATEMENTS,
    policyStatement(
      "DenyIdentityAdministration",
      "Deny",
      ["account:*", "iam:*", "identitystore:*", "organizations:*", "sso:*"],
      "*",
    ),
    policyStatement("DenyRecoveryActivationBeforeWp039", "Deny", RECOVERY_ACTIONS, "*"),
    policyStatement(
      "DenyApplicationDeployment",
      "Deny",
      APPLICATION_MUTATION_ACTIONS,
      "*",
    ),
  ]);

  return Object.freeze({
    ShelfStateAccountAdmin: permissionSet(
      "ShelfStateAccountAdmin",
      accountAdminPolicy,
      [
        "application deployment",
        "backup restore and recovery",
        "account-wide maintenance administration outside ShelfState access scope",
      ],
    ),
    ShelfStateOperator: permissionSet("ShelfStateOperator", operatorPolicy, [
      "resource-scoped application observability after resources exist",
    ]),
    ShelfStateRecovery: permissionSet("ShelfStateRecovery", recoveryPolicy, [
      `restore activation pending ${RECOVERY_ACTIVATION_WORK_PACKAGE}`,
    ]),
  });
}
