# EKS SaaS Reference Architecture - 변경사항 정리

## 개요

AWS EKS SaaS Factory Reference Architecture를 기반으로 다음과 같은 대규모 마이그레이션 및 개선 작업을 수행했습니다.

---

## 1. 프론트엔드: Angular → React 마이그레이션

### AdminWeb (관리자 포털)
- Angular + AWS Amplify 기반에서 React + `oidc-client-ts` / `react-oidc-context` 기반으로 전환
- `AuthContext`에서 OIDC 인증 상태 관리, `useAuth()` 훅 제공
- "No matching state found" 에러 시 자동 stale state 정리 및 복구
- Material UI 기반 UI 구성 (테넌트 CRUD, 대시보드)

### Application (테넌트 사용자 포털)
- Angular + AWS Amplify 기반에서 React + `oidc-client-ts` / `react-oidc-context` 기반으로 전환
- `TenantContext`에서 테넌트 정보를 `sessionStorage`로 관리 (URL 경로 대신)
- 테넌트별 Cognito User Pool에 대해 동적으로 OIDC 설정 구성
- `httpClient`에서 `id_token`을 자동 주입 (Istio JWT 검증에 `custom:tenant-id` claim 필요)
- OIDC 콜백 후 URL에서 `code`/`state` 파라미터 자동 정리 (리프레시 시 "No matching state" 에러 방지)
- Products, Orders, Users CRUD 페이지 구현
- `ErrorBoundary` 컴포넌트로 런타임 에러 처리

### 주요 파일
- `clients/AdminWeb/src/` — AdminWeb React 앱 전체
- `clients/Application/src/` — Application React 앱 전체
- `clients/Application/src/services/httpClient.ts` — JWT 자동 주입 HTTP 클라이언트
- `clients/Application/src/contexts/TenantContext.tsx` — 테넌트 상태 관리
- `clients/Application/src/services/authConfigService.ts` — 테넌트별 OIDC 설정 조회

---

## 2. 백엔드: Java Spring Boot → NestJS 마이그레이션

### 아키텍처
- Java Spring Boot 마이크로서비스 3개를 NestJS (Node.js 20) 모노레포로 전환
- 모노레포 구조: `services/application-services/application/`
  - `microservices/order/` — Order 서비스 (포트 3010)
  - `microservices/product/` — Product 서비스 (포트 3010)
  - `microservices/user/` — User 서비스 (포트 3010, Cognito Admin API 사용)
  - `libs/auth/` — 공유 인증 라이브러리 (IstioAuthGuard, TokenVendingMachine)
  - `libs/client-factory/` — DynamoDB 클라이언트 팩토리 (티어별 분기)

### IstioAuthGuard
- 기존 `JwtAuthGuard` (앱 레벨 JWT 검증) 대신 `IstioAuthGuard` 사용
- Istio가 JWT 검증 후 주입하는 `x-tenant-id` 헤더를 읽어 `request.user`에 테넌트 정보 설정
- 앱 레벨에서는 JWT 검증 불필요 (Istio RequestAuthentication이 처리)

### ClientFactoryService (티어별 DynamoDB 접근)
- **Basic 티어**: 공유 테이블 + STS AssumeRole (ABAC leading key isolation)
  - `TokenVendingMachine`이 JWT의 `custom:tenant-id` claim을 세션 태그로 사용
  - IAM 정책의 `dynamodb:LeadingKeys` 조건으로 테넌트 데이터 격리
- **Standard/Premium 티어**: 테넌트별 전용 테이블 + IRSA (ServiceAccount 자격증명)
  - 별도의 STS 호출 없이 Pod의 ServiceAccount에 연결된 IAM Role 사용

### User 서비스 특이사항
- Cognito Admin API (`AdminCreateUser`, `ListUsersInGroup` 등) 직접 호출
- `COGNITO_USER_POOL_ID` 환경변수 필요
- User Pool이 `UsernameAttributes: ["email"]`이므로 `Username`에 이메일 사용
- `custom:userRole` 속성이 User Pool 스키마에 없으므로 제거
- `findAll`에서 Cognito 그룹이 없으면 빈 배열 반환 (ResourceNotFoundException 방지)

### Docker 빌드
- 서비스별 Dockerfile: `Dockerfile.order`, `Dockerfile.product`, `Dockerfile.user`
- Multi-stage 빌드: Node.js 20 Alpine 기반, `npx nest build <service>` 후 dist만 복사
- 이미지 크기: ~54MB (기존 Java ~311MB 대비 약 82% 감소)

### 주요 파일
- `services/application-services/application/` — NestJS 모노레포 전체
- `services/application-services/application/libs/auth/src/istio-auth.guard.ts` — Istio 기반 인증 가드
- `services/application-services/application/libs/auth/src/token-vending-machine.ts` — ABAC용 STS AssumeRole
- `services/application-services/application/libs/client-factory/src/client-factory.service.ts` — 티어별 DynamoDB 클라이언트
- `services-template.json` — 서비스 정의 (ECR 이미지명, Dockerfile명, URL prefix)

---

## 3. 서비스 메시: Nginx Ingress → Istio 마이그레이션

### Istio 설치 (EKS 클러스터 스택)
- Istio 1.24.2를 Helm 차트 3개로 설치:
  1. `istio-base` — CRD 설치 (Gateway, VirtualService, RequestAuthentication 등)
  2. `istiod` — 컨트롤 플레인
  3. `istio-ingressgateway` — NLB 타입 인그레스 게이트웨이
- `saas-gateway` Gateway 리소스: 포트 80에서 모든 호스트 수신

### 트래픽 흐름
```
Client → API Gateway → NLB → Istio Ingress Gateway → Gateway(saas-gateway)
  → VirtualService → Service(ClusterIP:80) → Pod(:3010)
```

### 테넌트별 Istio 리소스 (테넌트 온보딩 시 생성)
- **RequestAuthentication**: 테넌트 Cognito User Pool의 JWKS URI로 JWT 검증, `custom:tenant-id` claim을 `x-tenant-id` 헤더로 주입
- **AuthorizationPolicy**: `requestPrincipals: ["*"]` — 유효한 JWT가 있는 요청만 허용
- **VirtualService** (서비스별): `/{tenantId}/orders` → `/orders` URI 리라이팅

### Kubernetes 매니페스트
- `services/application-services/kubernetes/orders/service.yaml` — Deployment + Service + VirtualService
- `services/application-services/kubernetes/products/service.yaml`
- `services/application-services/kubernetes/users/service.yaml`
- 디렉토리명을 `order/product/user` → `orders/products/users`로 변경 (`serviceUrlPrefix`와 일치)
- Kustomize 기반 배포: 이미지 태그, ServiceAccount, VirtualService 경로를 sed/patch로 주입

### 주요 파일
- `lib/eks-cluster-stack.ts` — Istio Helm 차트 설치, Gateway 리소스 생성
- `services/application-services/kubernetes/*/service.yaml` — 서비스별 K8s 매니페스트

---

## 4. EKS 버전 업그레이드

- EKS 1.28 → 1.32 업그레이드
- `KubectlV32Layer` 사용 (`@aws-cdk/lambda-layer-kubectl-v32`)
- 테넌트 온보딩 스택에서도 동일하게 `KubectlV32Layer` 적용

### 주요 파일
- `lib/eks-cluster-stack.ts` — `eks.KubernetesVersion.V1_32`, `KubectlV32Layer`
- `services/tenant-onboarding/lib/tenant-onboarding-stack.ts` — `KubectlV32Layer`
- `services/tenant-onboarding/package.json` — CDK `^2.195.1`, `@aws-cdk/lambda-layer-kubectl-v32` 의존성

---

## 5. 테넌트 온보딩 수정사항

### TDZ 버그 수정
- `isBasicTier`/`abacRoleArn` 변수 선언을 DynamoDB `putItem` 참조보다 앞으로 이동
- Temporal Dead Zone으로 인한 런타임 에러 해결

### CDK Bootstrap 제거
- 온보딩/삭제 CodeBuild buildspec에서 `npm run cdk bootstrap` 명령 제거
- SSM PutParameter 권한 부족으로 실패하던 문제 해결

### .gitignore 수정
- `*.js` 규칙 제거 — `node_modules` 내 JS 파일이 CDK asset zip에서 제외되던 문제 해결

### 초대 이메일 URL 수정
- `https://{domain}/#/{tenantId}` (Angular 해시 라우팅) → `https://{domain}` (React)
- tenantId는 URL이 아닌 sessionStorage로 관리

### 주요 파일
- `services/tenant-onboarding/lib/tenant-onboarding-stack.ts`
- `services/tenant-onboarding/.gitignore`
- `services/tenant-onboarding/.npmignore`
- `lib/constructs/tenant-onboarding.ts`

---

## 6. CodeBuild 빌드 파이프라인

### application-service.ts 구조
- **Initial Build** (`{ServiceName}` 프로젝트): Docker 빌드 + ECR push + 모든 기존 테넌트 네임스페이스에 배포
- **Tenant Deploy** (`{ServiceName}TenantDeploy` 프로젝트): 특정 테넌트 네임스페이스에 배포
- 소스: S3 CDK asset bucket (services/application-services/ 디렉토리 zip)
- Docker 빌드: `docker build -f application/$DOCKERFILE_NAME application/`
- 환경변수 주입: `sed`로 KUSTOMIZE 플레이스홀더 치환 (TABLE_NAME, AWS_REGION, TENANT_TIER, IAM_ROLE_ARN 등)

### 주요 파일
- `lib/constructs/application-service.ts` — CodeBuild 프로젝트 정의
- `lib/services-stack.ts` — services-template.json 기반 서비스 생성

---

## 7. 인증 토큰 전략

- Application 클라이언트에서 `id_token` 사용 (기존 `access_token` 대신)
- 이유: `id_token`에 `custom:tenant-id` claim이 포함되어 있어 Istio RequestAuthentication이 이를 추출하여 `x-tenant-id` 헤더로 주입
- `access_token`에는 커스텀 속성이 포함되지 않음

---

## 8. 테넌트 온보딩 프로세스 및 티어별 프로비저닝

### 원본 EKS 레퍼런스와의 차이

원본 EKS 레퍼런스는 티어(Basic/Standard/Premium) 구분 없이 모든 테넌트를 동일하게 처리했습니다:
- 모든 테넌트마다 전용 네임스페이스, 전용 Order 테이블 생성
- ABAC Role / Token Vending Machine 패턴 없음
- Product 테이블만 정적 tenantId로 LeadingKeys 조건 적용
- Istio 리소스 없음 (Nginx Ingress 사용)

현재 버전에서는 ECS 레퍼런스의 티어별 차등 프로비저닝 패턴을 도입했습니다:
- Basic: 공유 테이블 + ABAC (STS AssumeRole + 세션 태그 기반 LeadingKeys 격리)
- Standard/Premium: 테넌트 전용 Order 테이블 + IRSA 직접 접근

### 온보딩 트리거 흐름
```
AdminWeb (테넌트 생성) → SaaS API (tenant-registrations) → EventBridge
  → ApplicationPlane (ProvisioningScriptJob) → provisioning.sh
  → CodeBuild (TenantOnboardingProject) → CDK deploy TenantStack-{tenantId}
  → post_build: CodeBuild ({Service}TenantDeploy) × 3 서비스
```

1. 관리자가 AdminWeb에서 테넌트 생성 요청 (tenantName, email, tier)
2. SaaS API → EventBridge → `provisioning.sh` 실행
3. `provisioning.sh`가 `TenantOnboardingProject` CodeBuild 트리거
4. CodeBuild가 `npm run cdk deploy TenantStack-{tenantId}` 실행 (CDK 스택 배포)
5. CDK 스택 배포 완료 후, post_build에서 3개 서비스의 `{Service}TenantDeploy` CodeBuild 트리거
6. 각 TenantDeploy가 해당 테넌트 네임스페이스에 Kubernetes 리소스 배포

### 티어별 신규 생성 리소스

#### Basic 티어

| 카테고리 | 리소스 | 설명 |
|----------|--------|------|
| 인증 | Cognito User Pool | 테넌트 전용 User Pool + App Client + Cognito Domain |
| 인증 | Cognito Admin User | 테넌트 관리자 계정 (이메일 초대 발송) |
| 데이터 | DynamoDB Tenant 엔트리 | Tenant 테이블에 테넌트 정보 저장 (ABAC_ROLE_ARN 포함) |
| 데이터 | _(공유 Order 테이블 사용)_ | 신규 테이블 생성 없음 — 기존 `Order` 테이블 공유 |
| 데이터 | _(공유 Product 테이블 사용)_ | 신규 테이블 생성 없음 — 기존 `Product` 테이블 공유 |
| IAM | ABAC Role | `{tenantId}-abac-role` — DynamoDB LeadingKeys 기반 테넌트 격리 |
| IAM | ABAC Role Trust Policy | 해당 테넌트의 IRSA ServiceAccount Role만 AssumeRole 허용 |
| K8s | Namespace | `{tenantId}` 네임스페이스 (`istio-injection: enabled`) |
| K8s | ServiceAccount | `{tenantId}-service-account` (IRSA: sts:AssumeRole + sts:TagSession) |
| K8s | Deployment × 3 | order, product, user Pod (Istio sidecar 자동 주입) |
| K8s | Service × 3 | ClusterIP 서비스 (포트 80 → 3010) |
| Istio | RequestAuthentication | Cognito JWKS JWT 검증, `custom:tenant-id` → `x-tenant-id` 헤더 |
| Istio | AuthorizationPolicy | 유효한 JWT 필수 (requestPrincipals: ["*"]) |
| Istio | VirtualService × 3 | `/{tenantId}/orders|products|users` URI 리라이팅 |

Basic 티어 데이터 접근 흐름:
```
Pod (IRSA) → STS AssumeRole (tag: tenant={tenantId}) → ABAC Role
  → DynamoDB (공유 Product/Order 테이블, LeadingKeys 격리)
```

#### Standard/Premium 티어

| 카테고리 | 리소스 | 설명 |
|----------|--------|------|
| 인증 | Cognito User Pool | 테넌트 전용 User Pool + App Client + Cognito Domain |
| 인증 | Cognito Admin User | 테넌트 관리자 계정 (이메일 초대 발송) |
| 데이터 | DynamoDB Tenant 엔트리 | Tenant 테이블에 테넌트 정보 저장 |
| 데이터 | DynamoDB Order 테이블 | `Order-{tenantId}` — 테넌트 전용 테이블 (RCU/WCU: 5) |
| 데이터 | _(공유 Product 테이블 사용)_ | 신규 테이블 생성 없음 — 기존 `Product` 테이블 공유 |
| K8s | Namespace | `{tenantId}` 네임스페이스 (`istio-injection: enabled`) |
| K8s | ServiceAccount | `{tenantId}-service-account` (IRSA: DynamoDB 직접 접근) |
| K8s | Deployment × 3 | order, product, user Pod (Istio sidecar 자동 주입) |
| K8s | Service × 3 | ClusterIP 서비스 (포트 80 → 3010) |
| Istio | RequestAuthentication | Cognito JWKS JWT 검증, `custom:tenant-id` → `x-tenant-id` 헤더 |
| Istio | AuthorizationPolicy | 유효한 JWT 필수 (requestPrincipals: ["*"]) |
| Istio | VirtualService × 3 | `/{tenantId}/orders|products|users` URI 리라이팅 |

Standard/Premium 티어 데이터 접근 흐름:
```
Pod (IRSA) → DynamoDB 직접 접근 (테넌트 전용 Order-{tenantId} + 공유 Product 테이블)
```

### 티어별 비교 요약

| 구분 | Basic | Standard/Premium |
|------|-------|-----------------|
| K8s Namespace | 전용 (향후 공유 네임스페이스로 개선 예정) | 전용 |
| Order 테이블 | 공유 `Order` 테이블 | 전용 `Order-{tenantId}` 테이블 |
| Product 테이블 | 공유 `Product` 테이블 | 공유 `Product` 테이블 |
| 데이터 격리 | ABAC (DynamoDB LeadingKeys + 세션 태그) | 테이블 수준 격리 |
| DynamoDB 접근 방식 | STS AssumeRole → ABAC Role | IRSA 직접 접근 |
| 추가 IAM Role | ABAC Role (테넌트별 1개) | 없음 |
| STS 호출 | 매 요청마다 AssumeRole | 없음 (IRSA 자격증명 사용) |
| Deployment/Service/VirtualService | 전용 (3개씩) | 전용 (3개씩) |

### 향후 개선 사항
- **Basic 티어 공유 네임스페이스**: 현재 Basic 티어도 테넌트별 전용 네임스페이스를 생성하지만, 비용 최적화를 위해 공유 네임스페이스(`basic-pool`)에 여러 Basic 테넌트의 Pod를 배치하는 방식으로 개선 필요. 이 경우 Istio RequestAuthentication/AuthorizationPolicy, VirtualService 라우팅, ServiceAccount 격리 등의 재설계가 필요함.

### 주요 파일
- `scripts/provisioning.sh` — 온보딩 트리거 스크립트
- `lib/app-plane-stack.ts` — EventBridge → ProvisioningScriptJob 연결
- `lib/constructs/tenant-onboarding.ts` — TenantOnboardingProject / TenantDeletionProject CodeBuild 정의
- `services/tenant-onboarding/lib/tenant-onboarding-stack.ts` — CDK 스택 (Cognito, DynamoDB, K8s, Istio, IAM)
- `services/tenant-onboarding/lib/cognito.ts` — Cognito User Pool / App Client 생성
- `lib/constructs/application-service.ts` — {Service}TenantDeploy CodeBuild (K8s 매니페스트 배포)

---

## 9. 보안 취약점 패치

### 컨테이너 이미지 보안 (Amazon Inspector 대응)
- Amazon Inspector가 실행 중인 컨테이너에서 CVE 취약점 감지 (wget, openssl, linux, perl, sqlite3, expat)
- 3개 NestJS 서비스 Dockerfile에 `apk update && apk upgrade --no-cache` 추가 (build + runtime 스테이지 모두)
- `openssl>=3.5.5-r0` 명시적 버전 고정으로 Critical CVE 대응
- `public.ecr.aws/docker/library/node:20-alpine` 프리픽스 유지 (Docker Hub rate limit 429 방지)

### ABAC Role Trust Policy 수정 (Palisade 보안 경고 대응)
- Palisade가 Basic 티어 ABAC Role의 `AnyPrincipal()` trust policy를 외부 접근 가능으로 감지
- Epoxy Mitigations가 자동으로 모든 trust policy statement를 `Deny`로 변경하여 긴급 차단
- `AnyPrincipal()` → `ArnPrincipal(tenantServiceAccount.role.roleArn)`로 수정
- 해당 테넌트의 IRSA ServiceAccount Role만 AssumeRole 가능하도록 제한
- 코드 구조 변경: `abacRole` 변수를 outer scope로 추출, trust policy 추가를 ServiceAccount 생성 이후로 이동

### EC2 노드 AMI 전환 (Amazon Linux 2 → Amazon Linux 2023)
- Amazon Linux 2 노드에서 kernel, ssm-agent, glib2, gnupg2, cri-tools, nerdctl, python 등 다수 CVE 감지
- Amazon Linux 2는 2025년 6월 표준 지원 종료
- `amiType: AL2_X86_64` → `AL2023_X86_64_STANDARD`로 전환
- 노드 그룹 롤링 교체 (기존 AL2 노드 drain → 새 AL2023 노드 생성 → Pod 자동 재배치)
- AL2023: kernel 6.1.161, containerd 2.1.5

### EKS Managed Addon 최신화
- VPC CNI: 버전 미지정 → `v1.21.1-eksbuild.3` (최신, glibc CVE 대응)
- kube-proxy: self-managed `v1.32.6` → Managed Addon `v1.32.11-eksbuild.2` (libcap, openssl-libs, glibc CVE 대응)
- coredns: self-managed `v1.11.4-eksbuild.2` → Managed Addon `v1.11.4-eksbuild.28`
- 3개 addon 모두 EKS Managed Addon으로 등록하여 향후 버전 관리 일원화

### 주요 파일
- `services/application-services/application/Dockerfile.order` — Alpine 보안 패치
- `services/application-services/application/Dockerfile.product` — Alpine 보안 패치
- `services/application-services/application/Dockerfile.user` — Alpine 보안 패치
- `services/tenant-onboarding/lib/tenant-onboarding-stack.ts` — ABAC Role trust policy 수정
- `lib/eks-cluster-stack.ts` — AL2023 전환, Managed Addon 추가

---

## 기술 스택 요약

| 구분 | 변경 전 | 변경 후 |
|------|---------|---------|
| 프론트엔드 | Angular + AWS Amplify | React + oidc-client-ts |
| 백엔드 | Java Spring Boot | NestJS (Node.js 20) |
| 인그레스 | Nginx Ingress Controller | Istio Service Mesh 1.24.2 |
| EKS 버전 | 1.28 | 1.32 |
| 노드 AMI | Amazon Linux 2 | Amazon Linux 2023 |
| 인증 (앱 레벨) | JWT 직접 검증 (JwtAuthGuard) | Istio 위임 (IstioAuthGuard) |
| 컨테이너 이미지 | ~311MB (Java) | ~54MB (Node.js Alpine) |
| kubectl 레이어 | KubectlV28Layer | KubectlV32Layer |
| EKS Addon 관리 | self-managed | EKS Managed Addon (vpc-cni, kube-proxy, coredns) |


---

## 10. ECS ↔ EKS 통합 작업 및 소스 레벨 차이 비교

### 개요

ECS Reference (`references/saas-ecs/`)와 EKS Reference를 최대한 동일하게 유지하기 위한 통합 작업을 수행했습니다.
SBT(SaaS Builder Toolkit)를 공통으로 사용하므로 tenant-config API 응답이 동일하며, 클라이언트 코드를 최대한 통일했습니다.

### 완료된 통합 작업

#### ECS Application: AWS Amplify → OIDC 마이그레이션
- `aws-amplify`, `@aws-amplify/ui-react` 제거
- `oidc-client-ts`, `react-oidc-context` 추가
- `withAuthenticator` HOC → `AuthProvider` + `useAuth()` 전환
- EKS Application과 동일한 인증 흐름으로 통일

#### authConfigService.ts 통일 (ECS/EKS 공통)
- SBT tenant-config API 응답(`userPoolId`, `appClientId`, `apiGatewayUrl`)을 동일하게 처리
- `deriveAuthServer()`: `userPoolId`에서 Cognito OIDC issuer URL 자동 생성
- `controlPlaneUrl` 사용, `apiUrl` fallback 지원

#### ECS User 서비스: email 로그인 방식 통일
- `AdminCreateUserCommand`의 `Username`을 `userDto.userName` → `userDto.userEmail`로 변경
- EKS와 동일하게 email을 Cognito username으로 사용
- Controller에서 `tenant` 객체 대신 `tenant.tenantId` 문자열 전달

#### ECS Cognito 초대 이메일 개선
- tenant name 포함: `[tenantName] Your temporary password`
- 자동 로그인 URL: `appSiteUrl?tenant=tenantName` (Standard/Premium)
- Basic 티어: tenant name 없이 일반 문구 (공유 User Pool이라 특정 tenant name 불가)

#### Application UnauthorizedPage: URL 쿼리 파라미터 자동 로그인
- `?tenant=xxx` 파라미터 감지 시 자동으로 tenant config 조회 → Cognito redirect
- ECS/EKS 모두 동일하게 적용

---

### 현재 남아있는 ECS ↔ EKS 소스 레벨 차이

#### AdminWeb 차이

| 파일 | EKS | ECS | 이유 |
|------|-----|-----|------|
| `constants/pricing.ts` | `basic`/`standard`/`premium` (소문자) | `BASIC`/`ADVANCED`/`PREMIUM` (대문자) | ECS 티어 체계가 다름 (Standard → Advanced) |
| `models/tenant.ts` | `companyName` 필드 있음 | `prices`, `useFederation`, `useEc2`, `useRProxy` 필드 있음 | ECS는 테넌트 생성 시 인프라 옵션(Federation, EC2, RProxy) 선택 가능 |
| `TenantCreate.tsx` | 단순 폼 (이름/이메일/회사/티어) | Federation/EC2/RProxy 토글 스위치 UI 포함 | ECS 아키텍처에서 테넌트별 인프라 구성 옵션 필요 |

#### Application 차이

| 파일 | EKS | ECS | 이유 |
|------|-----|-----|------|
| `orderService.ts` | `environment.apiUrl` + `tenantId/orders` | `apiGatewayUrl/orders` | EKS: Istio 라우팅(단일 URL + tenantId 경로), ECS: 테넌트별 API Gateway URL |
| `productService.ts` | `environment.apiUrl` + `tenantId/products` | `apiGatewayUrl/products` | 동일 |
| `userService.ts` | `environment.apiUrl` + `tenantId/users` | `apiGatewayUrl/users` | 동일 |

#### Backend 마이크로서비스 차이

| 영역 | EKS | ECS | 이유 |
|------|-----|-----|------|
| Auth Guard | `IstioAuthGuard` (클래스 레벨) | `JwtAuthGuard` (메서드 레벨) | EKS: Istio 서비스 메시가 JWT 검증, ECS: 앱이 직접 JWT 검증 |
| Cognito 커스텀 속성 | `custom:tenant-id` (하이픈) | `custom:tenantId` (카멜케이스) | 각 프로젝트의 User Pool 스키마 정의 차이 |
| Product `create()` | `await client.send()` | `client.send()` (await 없음) | ECS 원본 버그, EKS에서 수정됨 |
| User `users.module.ts` | `ClientFactoryModule` 없음 | `ClientFactoryModule` import 있음 | ECS 미사용 의존성 (Cognito만 사용) |

#### Dockerfile 차이

| 항목 | EKS | ECS | 이유 |
|------|-----|-----|------|
| 베이스 이미지 | `public.ecr.aws/docker/library/node:20-alpine` | `node:20-alpine` | EKS: ECR Public으로 Docker Hub rate limit 회피 |
| 패키지 매니저 | `npm` | `yarn` | 프로젝트별 선택 차이 |
| 빌드 명령 | `npx nest build <service>` (서비스별) | `yarn build` (전체) | EKS가 더 최적화된 선택적 빌드 |
| Product Dockerfile | 클린 | WORKSHOP-TEST 블록 (AWS CLI 설치) | ECS 워크샵/데모용 임시 코드 |

### 아키텍처에서 오는 필수 차이 (통일 불가)

1. **Auth Guard**: EKS는 Istio가 JWT 검증 → `IstioAuthGuard`, ECS는 앱이 직접 → `JwtAuthGuard`
2. **API 라우팅**: EKS는 단일 URL + tenantId 경로 (Istio VirtualService), ECS는 테넌트별 API Gateway URL
3. **Cognito 커스텀 속성명**: EKS `custom:tenant-id` (Istio claim mapping), ECS `custom:tenantId` (JWT strategy parsing)

### 통일 가능한 차이 (향후 작업)

1. AdminWeb 티어 체계 통일 (ADVANCED → STANDARD 또는 그 반대)
2. Dockerfile 베이스 이미지/패키지 매니저 통일
3. ECS Product `create()` await 버그 수정
4. ECS User `users.module.ts` 미사용 `ClientFactoryModule` 제거
5. ECS Product Dockerfile WORKSHOP-TEST 블록 제거

### 주요 파일
- `references/saas-ecs/client/Application/src/` — ECS Application 클라이언트
- `references/saas-ecs/client/AdminWeb/src/` — ECS AdminWeb 클라이언트
- `references/saas-ecs/server/application/microservices/` — ECS 백엔드 서비스
- `references/saas-ecs/server/lib/tenant-template/identity-provider.ts` — ECS Cognito 설정
- `clients/Application/src/` — EKS Application 클라이언트
- `clients/AdminWeb/src/` — EKS AdminWeb 클라이언트
- `services/application-services/application/microservices/` — EKS 백엔드 서비스
