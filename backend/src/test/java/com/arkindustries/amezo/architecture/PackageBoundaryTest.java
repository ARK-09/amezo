package com.arkindustries.amezo.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Compiles "features don't import each other's internals" into a rule
 * that fails the build, instead of leaving it as a convention nobody's
 * code is actually checked against. Not explicitly requested - flagged
 * as the one addition beyond the literal scaffold ask.
 *
 * common and config are deliberately excluded from the feature list:
 * they're the shared kernel and composition root, not features, and are
 * meant to be depended on by everything.
 *
 * Each feature may expose a `<feature>.api` sub-package as its only
 * cross-feature-importable surface (catalog.api.ProductExistenceQuery,
 * reviews.api.ReviewSummaryQuery, ...) - everything else in a feature
 * (entities, repositories, concrete services, controllers) stays
 * off-limits to every other feature. This is what lets catalog depend on
 * reviews for a review summary, and reviews depend on catalog for a
 * product-existence check, without either one reaching into the other's
 * internals.
 *
 * DONT_INCLUDE_TESTS is required, not optional: an integration test in
 * catalog legitimately needs identity.SellerRepository to satisfy
 * product.seller_id's FK when building fixtures. That's normal test
 * setup, not the production-code coupling this rule exists to catch -
 * without this option every such fixture trips the rule.
 */
class PackageBoundaryTest {

    private static final String BASE = "com.arkindustries.amezo";
    // refunds is the fifth feature, added with the refund domain. Registering it
    // here is not optional: a feature absent from this list is checked against
    // nobody, so refunds could have reached into orders' repositories and nothing
    // would have failed. It talks to orders, catalog and identity through their
    // api packages only, and exposes its own refunds.api for the traffic coming
    // back the other way (an order's derived REFUNDED status).
    private static final String[] FEATURES = {"catalog", "orders", "reviews", "identity", "refunds"};

    @Test
    void featuresDoNotDependOnEachOthersInternals() {
        JavaClasses classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages(BASE);

        for (String feature : FEATURES) {
            String[] othersInternal = Arrays.stream(FEATURES)
                    .filter(f -> !f.equals(feature))
                    .map(f -> BASE + "." + f + "..")
                    .toArray(String[]::new);
            String[] othersApi = Arrays.stream(FEATURES)
                    .filter(f -> !f.equals(feature))
                    .map(f -> BASE + "." + f + ".api..")
                    .toArray(String[]::new);

            DescribedPredicate<JavaClass> anotherFeaturesInternals =
                    JavaClass.Predicates.resideInAnyPackage(othersInternal)
                            .and(DescribedPredicate.not(JavaClass.Predicates.resideInAnyPackage(othersApi)));

            ArchRule rule = noClasses()
                    .that().resideInAPackage(BASE + "." + feature + "..")
                    .should().dependOnClassesThat(anotherFeaturesInternals)
                    .because("cross-feature access must go through another feature's <feature>.api "
                            + "package, not its entities/repositories/services directly");

            rule.check(classes);
        }
    }
}
