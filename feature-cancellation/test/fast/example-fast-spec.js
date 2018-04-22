describe("Example test set", function() {
    it("should have written tests",function(){
        expect(true).toBe(true);
    });

    it('should render the app', function() {
        var app = Rally.test.Harness.launchApp("catsFeatureCancellation");
        expect(app.getEl()).toBeDefined();
    });

});
