package com.arkindustries.amezo.common.reference;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The one place any client gets countries from, so the checkout selector and the
 * backend's validation can never disagree about what is selectable.
 *
 * Public: checkout is open to guests, so the list has to be readable before
 * anyone signs in.
 */
@RestController
@RequestMapping("/countries")
public class CountryController {

    @GetMapping
    public List<Country> list() {
        return CountryCatalog.all();
    }
}
