<#--
  Vereint Login-Theme: Split-Screen-Rahmen fuer alle Login-Seiten.
  Basis: keycloak.v2/login/template.ftl aus Keycloak 26.8.1
  (abgeglichen mit org.keycloak:keycloak-themes:26.8.1).
  Head, Macro-Parameter, Alerts, Locale-Dropdown, Scripts und alle
  <#nested>-Slots entsprechen dem Original. Vereint-Aenderungen:
  - Viewport mit viewport-fit=cover, theme-color, SVG-Favicon als Fallback
    (wenn das Theme keine favicons-Resourcen deklariert).
  - Body-Struktur: .vereint-shell (Branding-Panel + Formular-Karte) statt
    pf-v5-c-login; bodyClass der Seite wird an <body> angehaengt.
  - Optionaler Slot "eyebrow" ueber der Ueberschrift.
  - "info" bleibt im Karten-Body (.vereint-info, ohne die Footer-Band-
    Klassen des Originals), "socialProviders" in der Kartenfusszeile
    (.vereint-card-footer).
  - Fusszeile mit Links zu Impressum, Datenschutz und AGB der App.
-->
<#import "field.ftl" as field>
<#import "footer.ftl" as loginFooter>
<#import "theme-resources.ftl" as themeResourceTags>
<#macro username>
  <#assign label>
    <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
  </#assign>
  <@field.group name="username" label=label>
    <div class="${properties.kcInputGroup}">
      <div class="${properties.kcInputGroupItemClass} ${properties.kcFill}">
        <span class="${properties.kcInputClass} ${properties.kcFormReadOnlyClass}">
          <input id="kc-attempted-username" value="${auth.attemptedUsername}" readonly>
        </span>
      </div>
      <div class="${properties.kcInputGroupItemClass}">
        <button id="reset-login" class="${properties.kcFormPasswordVisibilityButtonClass} kc-login-tooltip" type="button"
              aria-label="${msg('restartLoginTooltip')}" onclick="location.href='${url.loginRestartFlowUrl}'">
            <i class="fa-sync-alt fas" aria-hidden="true"></i>
            <span class="kc-tooltip-text">${msg("restartLoginTooltip")}</span>
        </button>
      </div>
    </div>
  </@field.group>
</#macro>

<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}" lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>

<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="color-scheme" content="light${darkMode?then(' dark', '')}">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#1e3a8a">

    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${title!}</title>
    <#if themeResources?? && themeResources.favicons?has_content>
        <@themeResourceTags.renderFavicons themeResources.favicons url.resourcesPath />
    <#else>
        <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/favicon.svg" />
    </#if>
    <#if themeResources?? && themeResources.stylesCommon?has_content>
        <@themeResourceTags.renderStyles themeResources.stylesCommon url.resourcesCommonPath />
    <#elseif properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if themeResources?? && themeResources.styles?has_content>
        <@themeResourceTags.renderStyles themeResources.styles url.resourcesPath />
    <#elseif properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
    <#if darkMode>
      <script type="module" async blocking="render">
          <#outputformat "JavaScript">
          const DARK_MODE_CLASS = ${properties.kcDarkModeClass?c};
          const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

          updateDarkMode(mediaQuery.matches);
          mediaQuery.addEventListener("change", (event) => updateDarkMode(event.matches));

          function updateDarkMode(isEnabled) {
            const { classList } = document.documentElement;

            if (isEnabled) {
              classList.add(DARK_MODE_CLASS);
            } else {
              classList.remove(DARK_MODE_CLASS);
            }
          }
          </#outputformat>
      </script>
    </#if>
    <#if themeResources?? && themeResources.scripts?has_content>
        <@themeResourceTags.renderScripts themeResources.scripts url.resourcesPath "text/javascript" />
    <#elseif properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    <script type="module">
        <#outputformat "JavaScript">
        import { startSessionPolling } from ${(url.resourcesPath + "/js/authChecker.js")?c};

        startSessionPolling(
            ${url.ssoLoginInOtherTabsUrl?c}
        );
        </#outputformat>
    </script>
    <script type="module">
        document.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-once-link]");

            if (!link) {
                return;
            }

            if (link.getAttribute("aria-disabled") === "true") {
                event.preventDefault();
                return;
            }

            const { disabledClass } = link.dataset;

            if (disabledClass) {
                link.classList.add(...disabledClass.trim().split(/\s+/));
            }

            link.setAttribute("role", "link");
            link.setAttribute("aria-disabled", "true");
        });
    </script>
    <#if authenticationSession??>
        <script type="module">
             <#outputformat "JavaScript">
            import { checkAuthSession } from ${(url.resourcesPath + "/js/authChecker.js")?c};

            checkAuthSession(
                ${authenticationSession.authSessionIdHash?c}
            );
            </#outputformat>
        </script>
    </#if>
    <script>
      // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1404468
      const isFirefox = true;
    </script>
</head>

<body id="keycloak-bg" class="${properties.kcBodyClass!} ${bodyClass}" data-page-id="login-${pageId}">
<div class="vereint-shell">
  <aside class="vereint-brand" aria-hidden="true">
    <div class="vereint-brand-inner">
      <img src="${url.resourcesPath}/img/vereint-logo-mono.svg" alt="" class="vereint-brand-logo" width="440" height="140">
      <p class="vereint-brand-claim">${msg("vereintClaim")}</p>
      <p class="vereint-brand-sub">${msg("vereintClaimSub")}</p>
    </div>
    <div class="vereint-brand-nodes"></div>
  </aside>

  <main class="vereint-main">
    <header class="vereint-mobile-header">
      <a class="vereint-mobile-brand" href="${url.loginUrl}">
        <img src="${url.resourcesPath}/img/vereint-logo.svg" alt="vereint" class="${properties.kcLogoClass!} vereint-logo-light" width="440" height="140">
        <img src="${url.resourcesPath}/img/vereint-logo-mono.svg" alt="vereint" class="${properties.kcLogoClass!} vereint-logo-dark" width="440" height="140">
      </a>
    </header>

    <div class="${properties.kcFormCardClass!}">
      <div class="${properties.kcLoginMainHeader!} vereint-card-header">
        <#-- Optionaler Slot "eyebrow": nur Seiten des Vereint-Themes fuellen ihn. -->
        <#assign vereintEyebrow><#nested "eyebrow"></#assign>
        <#assign vereintEyebrowText = vereintEyebrow?markup_string?trim>
        <div class="vereint-card-heading">
          <#if vereintEyebrowText?has_content><p class="vereint-eyebrow">${vereintEyebrowText?no_esc}</p></#if>
          <h1 class="${properties.kcLoginMainTitle!} vereint-title" id="kc-page-title"><#nested "header"></h1>
        </div>
        <#if realm.internationalizationEnabled  && locale.supported?size gt 1>
        <div class="${properties.kcLoginMainHeaderUtilities!} vereint-locale">
          <div class="${properties.kcInputClass!}">
            <select
              aria-label="${msg("languages")}"
              id="login-select-toggle"
              onchange="if (this.value) window.location.href=this.value"
            >
              <#list locale.supported?sort_by("label") as l>
                <option
                  value="${l.url}"
                  ${(l.languageTag == locale.currentLanguageTag)?then('selected','')}
                >
                  ${l.label}
                </option>
              </#list>
            </select>
            <span class="${properties.kcFormControlUtilClass}">
              <span class="${properties.kcFormControlToggleIcon!}">
                <svg
                  class="pf-v5-svg"
                  viewBox="0 0 320 512"
                  fill="currentColor"
                  aria-hidden="true"
                  role="img"
                  width="1em"
                  height="1em"
                >
                  <path
                    d="M31.3 192h257.3c17.8 0 26.7 21.5 14.1 34.1L174.1 354.8c-7.8 7.8-20.5 7.8-28.3 0L17.2 226.1C4.6 213.5 13.5 192 31.3 192z"
                  >
                  </path>
                </svg>
              </span>
            </span>
          </div>
        </div>
        </#if>
      </div>

      <div class="${properties.kcLoginMainBody!} vereint-card-body">
        <#if !(auth?has_content && auth.showUsername() && !auth.showResetCredentials())>
            <#if displayRequiredFields>
                <div class="${properties.kcContentWrapperClass!}">
                    <div class="${properties.kcLabelWrapperClass!} subtitle">
                        <span class="${properties.kcInputHelperTextItemTextClass!}">
                          <span class="${properties.kcInputRequiredClass!}">*</span> ${msg("requiredFields")}
                        </span>
                    </div>
                </div>
            </#if>
        <#else>
            <#if displayRequiredFields>
                <div class="${properties.kcContentWrapperClass!}">
                    <div class="${properties.kcLabelWrapperClass!} subtitle">
                        <span class="${properties.kcInputHelperTextItemTextClass!}">
                          <span class="${properties.kcInputRequiredClass!}">*</span> ${msg("requiredFields")}
                        </span>
                    </div>
                    <div class="${properties.kcFormClass} ${properties.kcContentWrapperClass}">
                        <#nested "show-username">
                        <@username />
                    </div>
                </div>
            <#else>
                <div class="${properties.kcFormClass} ${properties.kcContentWrapperClass}">
                  <#nested "show-username">
                  <@username />
                </div>
            </#if>
        </#if>

        <#-- App-initiated actions should not see warning messages about the need to complete the action -->
        <#-- during login.                                                                               -->
        <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
            <div class="${properties.kcAlertClass!} pf-m-${(message.type = 'error')?then('danger', message.type)}">
                <div class="${properties.kcAlertIconClass!}">
                    <#if message.type = 'success'><span class="${properties.kcFeedbackSuccessIcon!}"></span></#if>
                    <#if message.type = 'warning'><span class="${properties.kcFeedbackWarningIcon!}"></span></#if>
                    <#if message.type = 'error'><span class="${properties.kcFeedbackErrorIcon!}"></span></#if>
                    <#if message.type = 'info'><span class="${properties.kcFeedbackInfoIcon!}"></span></#if>
                </div>
                <span class="${properties.kcAlertTitleClass!} kc-feedback-text">${message.summary}</span>
            </div>
        </#if>

        <#nested "form">

        <#if auth?has_content && auth.showTryAnotherWayLink()>
          <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post" novalidate="novalidate">
              <input type="hidden" name="tryAnotherWay" value="on"/>
              <a id="try-another-way" href="javascript:document.forms['kc-select-try-another-way-form'].requestSubmit()"
                  class="${properties.kcButtonSecondaryClass} ${properties.kcButtonBlockClass} ${properties.kcMarginTopClass}">
                    ${msg("doTryAnotherWay")}
              </a>
          </form>
        </#if>

        <#if switchOrganizationEnabled?? && switchOrganizationEnabled>
          <form id="kc-switch-organization-form" action="${url.loginAction}" method="post" novalidate="novalidate">
              <input type="hidden" name="switchOrganization" value="true"/>
              <a id="switch-organization" href="javascript:document.forms['kc-switch-organization-form'].requestSubmit()"
                  class="${properties.kcButtonSecondaryClass} ${properties.kcButtonBlockClass} ${properties.kcMarginTopClass}">
                    ${msg("doSwitchOrganization")}
              </a>
          </form>
        </#if>

        <#if displayInfo>
          <div id="kc-info" class="vereint-info">
              <div id="kc-info-wrapper">
                  <#nested "info">
              </div>
          </div>
        </#if>
      </div>

      <div class="${properties.kcLoginMainFooter!} vereint-card-footer">
        <#nested "socialProviders">
      </div>
    </div>

    <footer class="vereint-footer">
      <@loginFooter.content/>
      <#-- Auf dem Server liegt Keycloak unter einer eigenen Domain (auth.DOMAIN).
           Die Links zeigen deshalb auf die App des Clients (Root-URL, z. B.
           https://vereint.DOMAIN). Ohne Client bleiben sie relativ; auf
           auth.DOMAIN liefert der Server dann Impressum und Datenschutz der
           Plattform aus (Rolle legal). -->
      <#assign legalBase = "">
      <#if client?? && client.baseUrl?has_content>
        <#assign legalBase = client.baseUrl?remove_ending("/")>
      </#if>
      <nav class="vereint-legal-links" aria-label="${msg("vereintLegalNav")}">
        <a href="${legalBase}/impressum">${msg("vereintImprint")}</a>
        <span aria-hidden="true">·</span>
        <a href="${legalBase}/datenschutz">${msg("vereintPrivacy")}</a>
        <#if legalBase?has_content>
        <span aria-hidden="true">·</span>
        <a href="${legalBase}/agb">${msg("vereintTerms")}</a>
        </#if>
      </nav>
    </footer>
  </main>
</div>
</body>
</html>
</#macro>
